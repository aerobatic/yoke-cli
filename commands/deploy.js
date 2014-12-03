var chalk = require('chalk');
var util = require('util');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var fs = require('fs');
var os = require('os');
var zlib = require('zlib');
var path = require('path');
var glob = require("glob");
var open = require('open');
var shortid = require('shortid');
var api = require('../lib/api');
var log = require('../lib/log');
var buildTool = require('../lib/buildTool');
var helper = require('../lib/helper');

require("simple-errors");

var compressExtensions = ['.html', '.css', '.js', '.json', '.txt', '.svg'];

module.exports = function(program, done) {
  program = _.defaults(program || {}, {
    inquirer: require('inquirer'),
    cwd: process.cwd()
  });

  // Create a new version object
  var versionData= {
    versionId: shortid.generate(),
    appId: program.appId,
    userId: program.userId
  };

  versionData.storageKey = versionData.versionId;

  var asyncTasks = [], aerobaticApp, deployFiles, newVersion, skipBuildStep;

  asyncTasks.push(function(cb) {
    // Call the API to fetch the application.
    api(program, {path: '/api/apps/' + program.appId}, function(err, app) {
      if (err) return cb(err);
      aerobaticApp = app;
      cb();
    });
  });

  var runBuildStep = false;
  asyncTasks.push(function(cb) {
    collectVersionInputs(cb);
  });

  if (runBuildStep === true) {
    // Run "npm run-script build"
    asyncTasks.push(function(cb) {
      spawn('npm', ['run-script', 'build'], cb);
    });
  }

  asyncTasks.push(function(cb) {
    gatherDeployFiles(function(err, result) {
      if (err) return cb(err);
      deployFiles = result;
      cb();
    });
  });

  asyncTasks.push(verifyRequiredFiles);    
  asyncTasks.push(deployFiles);
  asyncTasks.push(createNewVersion);
  
  async.series(asyncTasks, function(err) {
    if (err) return done(err);

    log.success("New version %s deployed and available at: %s", newVersion.versionId, newVersion.previewUrl);
    if (program.open === true)
      open(newVersion.previewUrl);

    done();
  });

  function verifyRequiredFiles(callback) {
    log.debug("Verify required deploy files");

    // Verify that index.html and optionally login.html exist.
    if (_.contains(deployFiles.files, 'index.html') === false)
      return callback(util.format("No index.html file present in deploy directory %s", deployFiles.baseDir));
    else if (aerobaticApp.authConfig && aerobaticApp.authConfig.type === 'oauth' && _.contains(deployFiles.files, 'login.html') === false)
      return callback(util.format("This application has oAuth enabled, but no login.html file present in deploy directory %s. See http://www.aerobatic.com/docs/authentication for more details."));

    callback();
  }

  function gatherDeployFiles(callback) {
    var files = [], patterns = [], baseDir;

    var patterns = _.isArray(program.deployFiles) ? program.deployFiles : null;
    var baseDir = program.deployBase ? program.deployBase : null;

    if ((patterns && !baseDir) || (baseDir && !patterns)) {
      return callback("If explicit deploy config is specified in package.json, both deployFiles and deployBase must be specified.\n" +
        "See http://www.aerobatic.com/docs/project-configuration for details.");
    }

    // If no explicit deploy config specified in package.json, rely on the convention of built assets all being
    // present in either a 'dist' or 'build' directory.
    if (!patterns) {
      // Check for the existence of a 'build' or 'dist' directory.
      baseDir = helper.takeFirstExistsPath(program.cwd, ['dist', 'build']);
      if (!baseDir) {
        return callback("By convention yoke expects all the built assets to be written to a directory named 'dist' or 'build'.\n" +
          "Alternatively you can configure a set of glob patterns in your package.json that specify exactly what to deploy.\n" +
          "See http://www.aerobatic.com/docs/project-configuration for details.");
      }
      patterns = ["**/*.*"];
    }

    async.each(patterns, function(pattern, cb) {
      glob(pattern, {cwd: baseDir, dot: false, nodir: true}, function(err, matches) {
        if (err) return cb(err);

        for (var i=0; i<matches.length; i++) {
          var fileError = validateFile(matches[i]);
          if (_.isString(fileError))
            return cb(fileError);

          // TODO: Verify the file name and file size;
          if (_.contains(files, matches[i]) === false) {
            log.debug(matches[i]);
            files.push(matches[i]);
          }
        }
        cb();
      });
    }, function(err) {
      if (err) return callback(err);
      callback(null, {baseDir: baseDir, files: files});
    });
  }

  function validateFile(file) {
    return true;
  }

  function collectVersionInputs(callback) {
    // Perform an unattended deployment, possibly from a CI process.
    if (program.unattended === true) {
      // Assuming that a CI process would have already run the build step.
      runBuildStep = false;
      if (_.isEmpty(program.version)) {
        var versionNameError = validateVersionName(program.version);
        if (_.isString(versionNameError))
          return callback(versionNameError);
      }
      else
        versionData.name = getDefaultVersion();

      versionData.message = program.message;
      if (program.force === true)
        versionData.force = true;

      return callback();
    }

    log.messageBox("Deploy a new version of the app.");

    // Use inquirer to collect input.    
    questions = [
      {
        type: 'input',
        name: 'version',
        message: 'Version name',
        default: getDefaultVersion(),
        validate: validateVersionName
      },
      {
        type: 'input',
        name: 'message',
        message: 'Message (optional)'
      },
      {
        type: 'confirm',
        name: 'runBuildStep',
        message: 'Run "npm run-script build?"',
        when: function() {
          return _.isEmpty(program.npmScripts.build) === false;
        },
        default: true
      },
      // TODO: Allow organization to disallow this.
      {
        type: 'confirm',
        name: 'force',
        message: 'Immedietely direct all production traffic to this new version?',
        default: aerobaticApp.trafficControlEnabled === true ? true : false,
        when: function(answers) {
          return aerobaticApp.trafficControlEnabled === true;
        }
      }
    ];

    program.inquirer.prompt(questions, function(answers) {
      runBuildStep = answers.runBuildStep;

      // If trafficControl is not enabled on the app, then always force traffic 
      // to the new version.
      program.force = aerobaticApp.trafficControlEnabled !== true ? true : answers.force;
      versionData.name = answers.version;
      versionData.message = answers.message;

      log.blankLine();
      callback();
    });
  }

  function getDefaultVersion() {
    // Look first to the version attribute in the NPM config. When yoke is initialized
    // the version from package.json is written to program.appVersion.
    if (program.appVersion)
      return program.appVersion;

    // Fallback to a local timestamp
    var now = new Date();
    return util.format("%s-%s-%s-%s:%s", now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());
  }

  function validateVersionName(name) {
    if (/^[a-z\.\_\-0-9]{5,20}$/i.test(name) !== true)
      return "Version " + name + " can only consist of letters, numbers, dashes, periods, or underscores and must be between 5 and 20 characters";
    return true;
  }

  function deployFiles(callback) {
    // PUT each file individually
    var uploadCount = 0;

    async.each(deployFiles.files, function(file, cb) {
      var filePath = path.relative(program.cwd, path.join(deployFiles.baseDir, file));

      // Ensure the slashes are forward in the relative path
      var relativePath = file.replace(/\\/g, '/');

      var uploadPath = versionData.storageKey + '/' + relativePath;
      uploadCount++;

      var compress = shouldCompress(file);
      uploadFile(filePath, uploadPath, compress, cb);
    }, function(err) {
      if (err)
        return callback(Error.create("Error deploying source files", {}, err));

      log.info('Done uploading %s files', uploadCount);
      callback();
    });
  }

  function shouldCompress(filePath) {
    // Don't compress any of the pages that are served from the app platform rather than the CDN.
    if (filePath == 'index.html' || filePath == 'login.html') {
      log.debug("Do not compress file %s", filePath);
      return false;
    }

    return _.contains(compressExtensions, path.extname(filePath));
  }

  function uploadFile(filePath, uploadPath, compress, callback) {
    log.debug("Start upload of " + filePath);

    var requestOptions = {
      path: '/dev/' + program.appId + '/deploy/' + uploadPath,
      headers: {},
      method: 'POST'
    };

    function upload(file) {
      log.info('Deploying file /%s', uploadPath);
      fs.stat(file, function(err, stat) {
        requestOptions.headers['Content-Length'] = stat.size;
        return fs.createReadStream(file)
          .pipe(api(program, requestOptions, callback));
      });
    }

    if (compress === true) {
      log.info('Compressing file ' + filePath);
      requestOptions.headers['Content-Type'] = 'application/gzip';

      // Use a random file name to avoid chance of collisions
      var gzipFile = path.join(os.tmpdir(), shortid.generate() + path.extname(filePath) + '.gz');

      log.debug("Writing to gzipFile %s", gzipFile);
      fs.createReadStream(filePath)
        .pipe(zlib.createGzip())
        .pipe(fs.createWriteStream(gzipFile))
        .on('error', function(err) {
          return callback(err);
        })
        .on('finish', function() {
          return upload(gzipFile);
        });
    }
    else {
      upload(filePath);
    }
  }

  function createNewVersion(callback) {
    // Create the new version
    log.info('Creating new version');

    if (program.force === true) {
      versionData.forceAllTrafficToNewVersion = '1';
      if (aerobaticApp.trafficControlEnabled === true)
        log.info(chalk.yellow('Forcing all traffic to the new version.'));
    }

    var requestOptions = {
      method: 'POST', 
      path: '/api/apps/' + program.appId + '/versions',
      json: versionData
    };

    api(program, requestOptions, function(err, version) {
      if (err) return callback(err);
      newVersion = version;
      callback();
    });
  }
};