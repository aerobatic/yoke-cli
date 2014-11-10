var chalk = require('chalk');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var zlib = require('zlib');
var tar = require('tar');
var fs = require('fs');
var path = require('path');
var spawn = require('../lib/spawn');
var uiHelper = require('../lib/uiHelper');

require("simple-errors");

module.exports = function(options) {
  options = _.defaults(options || {}, {
    templatesUrl: 'https://raw.githubusercontent.com/aerobatic/markdown-content/master/metadata/appTemplates.json',
    gitHubUrl: 'https://github.com',
    inquirer: require('inquirer'),
    baseDir: process.cwd()
  });

  return function(program, done) {
    program = _.defaults(program || {}, {
      templatesUrl: 'https://raw.githubusercontent.com/aerobatic/markdown-content/master/metadata/appTemplates.json',
      gitHubUrl: 'https://github.com',
      inquirer: require('inquirer'),
      baseDir: process.cwd()
    });

    // TODO: Allow user to choose which organization to create the app for
    // TODO: Allow user to choose between "starting from scratch" or "use existing app"

    // Load the templates from the GitHub content repo
    // https://raw.githubusercontent.com/aerobatic/markdown-content/master/metadata/appTemplates.json

    uiHelper.debug("Fetching templatesMetadata from %s", options.templatesUrl);
    request(options.templatesUrl, function(err, resp, body) {
      if (err) return done(err);

      var templatesMetadata = JSON.parse(body);
      uiHelper.debug(JSON.stringify(templatesMetadata));

      promptQuestions(templatesMetadata, function(answers) {
        var appDir = path.join(options.baseDir, answers.appName);
        uiHelper.debug("Setting appDir to %s", appDir);

        var tasks = [];
        tasks.push(function(cb) {
          uiHelper.progress("Making app directory %s", appDir);
          fs.mkdir(appDir, cb);
        });

        if (answers.template) {
          tasks.push(function(cb) {
            unpackTemplate(answers.template, answers.buildTool, appDir, cb);
          });

          tasks.push(function(cb) {
            npmInstall(appDir, cb);
          });

          tasks.push(function(cb) {
            bowerInstall(appDir, cb);
          });
        }

        // Call the API to create the app.
        // Update the package.json

        async.series(tasks, function(err) {
          if (err) return done(err);

          uiHelper.success("App %s has been created", answers.appName);
          done();
        });
      });
    });
  };

  function promptQuestions(templatesMetadata, callback) {
    var questions = [];

    questions.push({
      type: 'rawlist',
      name: 'startingMode',
      choices: [
        {name:'Starting from scratch', value:'scratch'},
        {name:'Existing code', value:'existing'}
      ]
    });

    // App name question
    questions.push({
      type:'input', 
      name:'appName', 
      validate: function(input) {
        var done = this.async();
        
        if (!/^[a-z0-9-_]+/.test(input))
          return done("Name may only contain letters, numbers, dashes, and underscores");

        // TODO: Call API to validate app name is available
        done(true);
      },
      message: 'App name'
    });

    // App template question
    questions.push(buildAppTemplateQuestion(templatesMetadata));

    questions.push({
      type: 'rawlist',
      name: 'branch',
      message: 'Preferred build tool',
      choices: function(answers) {
        return answers.template.buildTools;
      },
      when: function(answers) {
        return answers.template && _.isArray(answers.template.buildTools);
      }
    });

    options.inquirer.prompt(questions, callback);
  }

  function buildAppTemplateQuestion(templatesMetadata) {
    var question = {
      type: 'rawlist',
      name: 'template',
      message: 'Select template',
      choices: []
    };

    question.choices.push({name: 'None', value:null});

    // debugger;
    templatesMetadata.templates.forEach(function(template, i) {
      question.choices.push({name:template.title, value: template});
    });

    return question;
  }

  function npmInstall(appDir, callback) {
    fs.exists(path.join(appDir, 'package.json'), function(exists) {
      if (!exists) {
        uiHelper.debug("No package.json file exists in app directory");
        return callback();
      }

      uiHelper.progress("Installing npm dependencies");
      spawn('npm', ['install'], appDir, callback);
    });
  }

  function bowerInstall(appDir, callback) {
    fs.exists(path.join(appDir, 'bower.json'), function(exists) {
      if (!exists) {
        uiHelper.debug("No bower.json file exists in app directory");
        return callback();
      }

      uiHelper.progress("Installing bower dependencies");
      spawn('bower', ['install'], appDir, callback);
    });
  }

  function unpackTemplate(template, buildTool, appDir, callback) {
    var branch = buildTool || 'master';

    // Download, unzip, and extract the template from GitHub repo.
    var archiveUrl = options.gitHubUrl + '/' + template.gitHubRepo + '/archive/' + branch + '.tar.gz';
    uiHelper.progress("Unpacking template from %s", archiveUrl);

    request(archiveUrl)
      .pipe(zlib.createGunzip())
      .pipe(tar.Extract({path: appDir, strip: 1}))
      .on('error', function(err) {
        return callback(err);
      })
      .on('end', callback);
  }
};