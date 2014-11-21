var _ = require('lodash');
var express = require('express');
var buildTool = require('../lib/buildTool');
var cors = require('cors');
var util = require('util');
var async = require('async');
var log = require('../lib/log');
var http = require('http');
var https = require('https');
var openBrowser = require('open');
var path = require('path');
var fs = require('fs');
var tinylr = require('tiny-lr');
var urlParse = require('url').parse;
var onFinished = require('on-finished');
var chalk = require('chalk');
var bodyParser = require('body-parser');
var api = require('../lib/api');
var helper = require('../lib/helper');
var indexPage = require('../lib/indexPage');
var Gaze = require('gaze').Gaze;

module.exports = function(program, done) {
  var aerobaticApp, watcher, localhostServer, liveReloadServer, watchedFiles = [], simulatorUrl;

  if (program.simulator === true)
    log.messageBox("Run a local server for assets while index page runs on simulator host.\nPress Ctrl+C to quit.");
  else
    log.messageBox("Run a full localhost server.\nPress Ctrl+C to quit.");

  var asyncTasks = [];
  asyncTasks.push(function(cb) {
    // Fetch the app from the API so we have access to the env variables.
    log.info("Fetching app info from Aerobatic API");  
    api(program, {method: 'GET', path: '/api/apps/' + program.appId}, function(err, app) {
      if (err) return cb(err);

      // Apps with oauth enabled need to be run in simulator mode.
      if (app.authConfig && app.authConfig.type === 'oauth' && program.simulator === false) {
        return cb(new Error("This app has OAuth enabled. Development of this app should happen in simulator mode. Try running 'yoke sim' instead."))
      }
      
      aerobaticApp = app;     
      cb();
    });
  });

  asyncTasks.push(setDefaults);

  if (program.simulator === true) {
    // If this is simulator mode, upload the index pages to the simulator host.
    asyncTasks.push(function(cb) {
      uploadIndexPageToSimulator([program.indexPage, program.loginPage], cb);
    });
  }
      
  asyncTasks.push(function(cb) {
    if (_.isEmpty(program.watch) === false)
      buildTool(program.watch, {cwd: program.cwd, normalizeStdio: true, waitForExit: false}, cb);
    else
      cb();
  });

  asyncTasks.push(function(cb) {
    // Start the localhost server
    startLocalServer(function(localhostUrl) {
      log.info("App running at %s", localhostUrl);

      if (program.simulator === true)
        simulatorUrl = buildSimulatorUrl();

      // Open a browser tab with the localhost URL
      if (program.open)
        openBrowser(simulatorUrl || localhostUrl);

      cb();
    });
  });

  async.series(asyncTasks, function(err) {
    if (err)
      return done(err);

    if (program.livereload) {
      log.debug("Starting watcher for file changes");

      var indexPages = _.compact([program.indexPage, program.loginPage]); 

      log.info("Watching pages %s", JSON.stringify(indexPages));
      watcher = new Gaze(indexPages, {maxListeners: 100}, function() {
        waitForExit();
      });

      watcher.on('changed', onFileChanged);
      watcher.on('error', function(err) {
        log.warn("Watch error %s", err.message);
      });
    }
    else
      waitForExit();
  });

  function waitForExit() {
    done(null, function() {
      if (watcher)
        watcher.close();

      if (localhostServer) {
        log.debug("Closing localhost server");
        localhostServer.close();
      }
      if (liveReloadServer) {
        log.debug("Closing livereload server");
        liveReloadServer.close();
      }
    });
  }

  function onFileChanged(filePath) {
    log.debug("Change to %s detected", filePath);

    if (program.simulator === true && (filePath === program.indexPage || filePath === program.loginPage)) {
      // Upload the modified index.html to the simulator
      uploadIndexPageToSimulator(filePath, function(err) {
        if (err) return done(err);

        program.lastFileChanges = [filePath];
        tinylr.changed('/');
      });
    }
    else {
      var assetUrlPath;
      if (filePath === program.indexPage)
        assetUrlPath = '/';
      else if (_.contains(watchedFiles, filePath))
        assetUrlPath = path.relative(program.baseDir, filePath);

      if (assetUrlPath) {
        //TODO: What if several files all changed at once.. We should buffer 
        //them up and send just one notification to livereload.
        program.lastFileChanges = [filePath];
        log.info("Livereload triggered by change to %s", filePath);
        tinylr.changed(assetUrlPath);
      }  
    }    
  }

  function uploadIndexPageToSimulator(indexPage, callback) {
    var requestOptions = {
      method: 'POST',
      path: '/dev/' + program.appId + '/simulator',
      form: {}
    };

    if (_.isString(indexPage))
      indexPage = [indexPage];
    indexPage = _.compact(indexPage);

    // Attach the files as multi-part
    var request = api(program, requestOptions, callback);
    var form = request.form();

    log.info("Uploading index pages %s to simulator", indexPage);

    //  TODO: If the page is a .haml or .jade file, compile to html first.
    _.each(indexPage, function(pagePath) {
      form.append(path.basename(pagePath, '.html'), fs.createReadStream(pagePath));      
    });
  }

  function startLocalServer(callback) {
    log.debug("Creating development express app");
    var localhost = express();

    var httpsOptions = {};

    // If the app requires SSL, use a self signed certificate for local development
    if (aerobaticApp.requireSsl === true) {
      _.extend(httpsOptions, {
        key: fs.readFileSync(path.join(__dirname, '../certs', 'server.key')).toString(),
        cert: fs.readFileSync(path.join(__dirname, '../certs', 'server.crt')).toString(),
        ca: fs.readFileSync(path.join(__dirname, '../certs', 'ca.crt')).toString(),
        passphrase: 'grunt',
        rejectUnauthorized: false
      });
    }

    localhost.use(function(req, res, next) {
      onFinished(res, function() {
        // Write each request to the log in a format that emulates NPM
        log.writeln({
          process: 'yoke', 
          status: res.statusCode, 
          color: res.statusCode === 200 ? 'green' : 'magenta',
          message: "Serving " + req.path
        });
      });

      // Make sure the path is in the list of files to watch.
      if (program.livereload) {
        // Watch any file that is requested by the page.
        var assetPath;
        if (req.path === '/')
          assetPath = program.indexPage;
        else
          assetPath = path.join(program.baseDir, req.path);

        if (_.contains(watchedFiles, assetPath) === false) {
          watcher.add([assetPath], function() {
            log.debug("Added watch to file %s", assetPath);  
            watchedFiles.push(assetPath);
            next();
          });
        } 
        else
          next();
      }
      else
        next();
    });

    localhost.get('/', function(req, res, next) {
      // Redirect the index page in simulator mode to the simulator host.
      if (program.simulator === true)
        return res.redirect(simulatorUrl);

      // TODO: If it's .jade or .haml compile them on the fly
      indexPage(program.indexPage, aerobaticApp, program, function(err, html) {        
        if (err) return next(err);

        res.set('Content-Type', 'text/html');
        res.send(html);
      });
    });

    localhost.use(cors());
    localhost.use(express.static(program.baseDir, {index: false}));

    // Create the livereload server
    if (program.livereload) {
      log.debug("Creating livereload server");

      var liveReloadOptions = _.extend(httpsOptions, {liveCSS: true, liveImg: true});
      liveReloadServer = tinylr(liveReloadOptions);

      // Make sure to call listen on a new line rather than chain it to the factory function
      // since the listen function does not return the server reference.
      liveReloadServer.listen(program.livereloadPort, function() {
        log.info("Livereload listening on port %s", program.livereloadPort);
      });
    }

    // Anything not served by the static middleware is a 404
    localhost.get('/*', function(req, res) {
      res.status(404).send("Not Found");
    });

    localhost.use(function(err, req, res, next) {
      return done(err);
    });


    if (aerobaticApp.requireSsl === true) {
      localhostServer = https.createServer(httpsOptions, localhost).listen(program.port, function() {
        var url = "https://localhost:" + program.port;
        callback(url);
      });
    }
    else {
       localhostServer = http.createServer(localhost).listen(program.port, function() {
        var url = "http://localhost:" + program.port;
        callback(url);
      });
    }
  }

  function setDefaults(callback) {
    _.defaults(program, {
      port: 3000,
      build: 'debug',
      watch: 'watch',
      livereload: true,
      // Intentionally not using standard livereload port to avoid collisions if 
      // the app is also using a browser livereload plugin.
      livereloadPort: 35728,
      cwd: process.cwd(),
      baseDirs: {}
    });

    // Verify that the build type is valid.
    if (_.contains(['debug', 'release'], program.build) === false) {
      return callback("Invalid build option value. Valid values are 'debug' and 'release'.");
    }

    // If an explicit baseDir was specified for the current build type, ensure it exists.
    if (_.isObject(program.baseDirs) && !_.isEmpty(program.baseDirs[program.build])) {
      var dir = path.join(program.cwd, program.baseDirs[program.build]);

      if (!fs.existsSync(dir)) {
        return callback(util.format("The %s directory %s specified in package.json does not exist.", 
          program.build, 
          program.baseDirs[program.build]));
      }
      program.baseDir = dir;
    } 

    // If there was no explicit baseDir specified in package.json, fallback to convention.
    if (!program.baseDir) {
      var baseDirConventions = {
        debug: ['src', 'app'],
        release: ['dist', 'build']
      };

      program.baseDir = helper.takeFirstExistsPath(program.cwd, baseDirConventions[program.build], program.cwd);
    } 

    // Find the index page
    var indexPageNames = ['index.html'] //, 'index.haml', 'index.jade'];
    program.indexPage = helper.takeFirstExistsPath(program.baseDir, indexPageNames);
    if (!program.indexPage) {
      return callback(util.format("Could not find any of the following pages in %s: %s", 
        JSON.stringify(indexPageNames), program.baseDir));
    }
    else
      log.debug("Using index page %s", program.indexPage);

    var loginPageNames = ['login.html', 'login.haml', 'login.jade'];
    if (aerobaticApp.authConfig && aerobaticApp.authConfig.type === 'oauth') {
      program.loginPage = helper.takeFirstExistsPath(program.baseDir, loginPageNames);
      if (!program.loginPage) {
        return callback(new Error(util.format("Apps with oauth enabled require a login page. None of the following pages exist in %s: %s", 
          JSON.stringify(loginPageNames), program.baseDir)));
      }
      else
        log.debug("Using login page %s", program.loginPage);
    }

    callback();
  }

  // Build the URL to the simulator host
  function buildSimulatorUrl() {
    var url = aerobaticApp.url + '?sim=1&port=' + program.port + '&user=' + program.userId;
    if (program.livereload === true)
      url += '&reload=1&lrport=' + program.livereloadPort;

    if (program.build === 'release')
      url += '&release=1';

    return url;
  }
};