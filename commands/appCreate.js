var chalk = require('chalk');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var zlib = require('zlib');
var tar = require('tar');
var fs = require('fs');
var path = require('path');
var spawn = require('../lib/spawn');
var api = require('../lib/api');
var log = require('../lib/log');
var npmConfig = require('../lib/npmConfig');
var helper = require('../lib/helper');

require("simple-errors");

module.exports = function(program, done) {
  if (program.githubRepo) {
    program.githubRepo = helper.parseGithubRepo(program.githubRepo);
    if (program.githubRepo === false) {
      return done("Invalid github-repo option");
    }
  }

  program = _.defaults(program || {}, {
    templatesUrl: 'https://raw.githubusercontent.com/aerobatic/markdown-content/master/metadata/appTemplates.json',
    githubUrl: 'https://github.com',
    inquirer: require('inquirer'),
    baseDir: process.cwd()
  });

  log.messageBox("Create a new Aerobatic app");

  collectInput(function(err, answers) {
    if (err) return done(err);

    // Print a blank line at the end of the questionaire
    log.blankLine();

    if (answers.confirmExistingDir === false)
      return done("Please re-run 'yoke app:create' from the root of the " +
        "directory where your existing app code resides.");

    var tasks = [], appDir;
    if (answers.startingMode === 'scratch' || program.githubRepo) {
      // Create a new directory corresponding to the app name
      appDir = path.join(program.baseDir, answers.appName);
      tasks.push(function(cb) {
        log.info("Making app directory %s", appDir);
        fs.mkdir(appDir, cb);
      });  
    }
    else
      appDir = program.baseDir;

    log.debug("Setting appDir to %s", appDir);

    if (answers.template) {
      var branch;
      if (answers.buildTool)
        branch = answers.buildTool + '-yoke';

      tasks.push(function(cb) {
        unpackTemplate(answers.template.githubRepo, branch, appDir, cb);  
      });
    }
    else if (program.githubRepo) {
      tasks.push(function(cb) {
        unpackTemplate(program.githubRepo, program.githubBranch, appDir, cb);  
      }); 
    }

    tasks.push(function(cb) {
      npmInstall(appDir, cb);
    });

    tasks.push(function(cb) {
      bowerInstall(appDir, cb);
    });

    var createdApp = null;
    // Call the API to create the app.
    tasks.push(function(cb) {
      invokeCreateAppApi(answers, function(err, app) {
        if (err) return cb(err);
        createdApp = app;
        cb(null);
      });
    });

    // Update the package.json
    tasks.push(function(cb) {
      npmConfig(appDir, createdApp, cb);
    });

    async.series(tasks, function(err) {
      if (err) return done(err);

      log.success("App created at %s", createdApp.url);
      log.info("Ready to launch the dev simulator and start coding!");

      if (answers.existing === true) {
        log.info("Run: " + chalk.cyan(chalk.underline("yoke sim -o")));
      }
      else {
        log.info("Switch to your new app directory: " + chalk.cyan(chalk.underline("cd " + answers.appName)));
        log.info("Then run: " + chalk.cyan(chalk.underline("yoke sim -o")));
      }

      done(null, createdApp);
    });
  });

  function collectInput(callback) {
    // TODO: Load all of this user's organizations.
    async.parallel({
      templates: getTemplateMetadata,
      organizations: loadOrganizations
    }, function(err, results){
      if (err) return callback(err);

      if (results.organizations.length == 0)      
        return callback("You need to belong to an organization to create a new app. Visit https://portal.aerobaticapp.com/orgs/create to get started.");

      promptQuestions(results, function(answers) {
        callback(null, answers);
      });
    });
  }

  function getTemplateMetadata(callback) {
    // Load the templates from the GitHub content repo
    log.debug("Fetching templatesMetadata from %s", program.templatesUrl);
    request(program.templatesUrl, function(err, resp, body) {
      if (err) return callback(err);

      var templates = JSON.parse(body).templates;
      _.each(templates, function(template) {
        // HACK: Get rid of this eventually
        // Normalize to githubRepo with lowercase "h". 
        template.githubRepo = template.gitHubRepo;
        delete template.gitHubRepo;
      });

      callback(null, templates);
    });
  }

  function loadOrganizations(callback) {
    // Get the user's organizations
    log.debug("Fetching organizations");
    api(program, {method: 'GET', path: '/api/profile/orgs'}, function(err, orgs) {
      if (err) return callback(err);
      callback(null, orgs);
    });
  }

  function promptQuestions(lookups, callback) {
    var questions = [];

    var orgChoices = [];
    _.each(lookups.organizations, function(org) {
      orgChoices.push({name: org.name, value: org.orgId});
    });

    // Question to choose which organization the app belongs
    if (_.isArray(lookups.organizations) && lookups.organizations.length > 0) {
      questions.push({
        type: 'list',
        name: 'orgId',
        choices: orgChoices,
        message: "Which organization does this app belong?"
      });
    }

    questions.push({
      type: 'list',
      name: 'startingMode',
      choices: [
        {name:'Starting from scratch', value:'scratch'},
        {name:'Existing code', value:'existing'}
      ],
      default: null,
      when: function() {
        // If a GitHub repo was passed in from the command line we are 
        // by definition starting from scratch.
        return !program.githubRepo;
      },
      message: "Are you starting this app from existing code or from scratch?"
    });

    // For existing code apps, have dev confirm that the current directory
    // is where their app code is located.
    questions.push({
      type: 'confirm',
      name: 'confirmExistingDir',
      message: 'Is this directory ' + program.baseDir + ' the location of your existing code?',
      when: function(answers) {
        return answers.startingMode === 'existing';
      }
    });

    // Prompt for input of the app name
    questions.push({
      type:'input', 
      message: 'App name',
      name:'appName', 
      validate: function(input) {
        var done = this.async();
    
        if (!/^[a-z0-9-_]+$/.test(input))
          return done("Name may only contain letters, numbers, dashes, and underscores");

        // TODO: Call API to validate app name is available
        appNameExists(input, function(err, exists) {
          if (err) {
            log.error(err);
            return done(err);
          }

          if (exists)
            done("App name " + input + " is not available.");
          else
            done(true);
        });
      },
      when: function(answers) {
        return answers.confirmExistingDir !== false;
      }
    });

    // Prompt user for which app template to start from
    questions.push({
      type: 'list',
      message: 'Select app template to start from',
      name: 'template',
      when: function(answers) {
        return answers.startingMode === 'scratch';
      },
      choices: buildTemplateChoices(lookups.templates)
    });

    // If the selected template is available in multiple build tools,
    // allow the dev to select which one.
    questions.push({
      type: 'list',
      name: 'buildTool',
      message: 'Preferred build tool',
      choices: function(answers) {
        return answers.template.buildTools;
      },
      when: function(answers) {
        return answers.template && _.isArray(answers.template.buildTools);
      }
    });

    program.inquirer.prompt(questions, callback);
  }

  function buildTemplateChoices(templates) {
    var choices = [];
    choices.push({name: 'None', value:null});

    // debugger;
    templates.forEach(function(template, i) {
      if (template.published !== false)
        choices.push({name:template.title, value: template});
    });

    return choices;
  }

  function npmInstall(appDir, callback) {
    fs.exists(path.join(appDir, 'package.json'), function(exists) {
      if (!exists) {
        return callback("No package.json file exists in app directory");
      }

      // If th node_modules directory already exists, assume npm install already run
      if (fs.exists(path.join(appDir, 'node_modules')))
        return callback();

      log.info("Installing npm dependencies in %s", appDir);
      spawn('npm', ['install'], {cwd: appDir, inheritStdio: true}, callback);
    });
  }

  function bowerInstall(appDir, callback) {
    fs.exists(path.join(appDir, 'bower.json'), function(exists) {
      if (!exists) {
        log.debug("No bower.json file exists in app directory");
        return callback();
      }

      log.info("Installing bower dependencies");
      spawn('bower', ['install'], {cwd: appDir, inheritStdio: true}, callback);
    });
  }

  function unpackTemplate(githubRepo, githubBranch, appDir, callback) {
    if (_.isEmpty(githubBranch) === true)
      githubBranch = 'master';

    // Download, unzip, and extract the template from GitHub repo.
    var archiveUrl = program.githubUrl + '/' + githubRepo + '/archive/' + githubBranch + '.tar.gz';
    log.info("Unpacking template %s", archiveUrl);

    request(archiveUrl)
      .pipe(zlib.createGunzip())
      .pipe(tar.Extract({path: appDir, strip: 1}))
      .on('error', function(err) {
        return callback(err);
      })
      .on('end', callback);
  }

  function invokeCreateAppApi(answers, callback) {
    var appData = {
      name: answers.appName
    };

    if (answers.orgId)
      appData.orgId = answers.orgId;

    var options = {
      method: 'POST',
      path: '/api/apps',
      json: appData
    };

    log.info("Invoking Aerobatic API to create app");
    var request = api(program, options, function(err, app) {
      if (err) return callback(Error.create("Error invoking Aerobatic API: " + JSON.stringify(err)));

      log.debug("api post to /api/apps succeeded");
      callback(null, app);
    });
  }

  // Check if the specified app name is already in use by an app.
  function appNameExists(appName, callback) {
    var options = {
      method: 'HEAD',
      path: '/api/apps/' + appName
    };

    api(program, options, function(err, body, statusCode) {
      if (err) return callback(err);

      return callback(null, statusCode === 200);
    });
  }
};