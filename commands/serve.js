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
var watch = require('glob-watcher');
var urlParse = require('url').parse;
var onFinished = require('on-finished');
var chalk = require('chalk');
var bodyParser = require('body-parser');
var api = require('../lib/api');
var indexPage = require('../lib/indexPage');

module.exports = function(program, done) {
  var error = setDefaults(program);
  if (error instanceof Error)
    return done(error);

  var aerobaticApp, watcher, localhostServer, liveReloadServer, watchedFiles = [];

  var asyncTasks = [];
  asyncTasks.push(function(cb) {
    // Fetch the app from the API so we have access to the env variables.
    log.info("Fetching app info from Aerobatic API");  
    api(program, {method: 'GET', path: '/api/apps/' + program.appId}, function(err, app) {
      if (err) return cb(err);

      // Store the aerobaticApp on the program.
      aerobaticApp = app;     
      cb();
    });
  });

  if (program.livereload) {
    watcher = watch([program.indexPage]);
    watcher.on('change', onFileChanged);

    if (_.isEmpty(program.watch) === false) {
      // Kick off the watch task for the build tool
      asyncTasks.push(function(cb) {
        buildTool(program.watch, {cwd: program.cwd, normalizeStdio: true}, cb);
      });
    }
  }

  asyncTasks.push(function(cb) {
    // Start the localhost server
    startLocalServer(function(url) {
      log.info("App running at %s", url);

      // Open a browser tab with the localhost URL
      if (program.open)
        openBrowser(url);

      cb();
    });
  });

  async.series(asyncTasks, function(err) {
    if (err)
      return done(err);

    done(null, function() {
      if (localhostServer) {
        log.debug("Closing localhost server");
        localhostServer.close();
      }
      if (liveReloadServer) {
        log.debug("Closing livereload server");
        liveReloadServer.close();
      }
    });
  });

  function onFileChanged(watchEvent) {
    log.debug("Change to %s detected", watchEvent.path);

    var assetUrlPath;
    // TODO: If the changed file is index.html and we are in simulator mode, re-upload it
    if (watchEvent.path === program.indexPage)
      assetUrlPath = '/';
    else if (_.contains(watchedFiles, watchEvent.path))
      assetUrlPath = path.relative(program.baseDir, watchEvent.path);

    if (assetUrlPath) {
      //TODO: What if several files all changed at once.. We should buffer 
      //them up and send just one notificatio to livereload.
      program.lastFileChanges = [watchEvent.path];
      log.info("Livereload triggered by change to %s", assetUrlPath);
      tinylr.changed(assetUrlPath);
    }
  }

  function startLocalServer(callback) {
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
      // Make sure the path is in the list of files to watch.
      if (program.livereload) {
        // Watch any file that is requested by the page.
        var assetPath;
        if (req.path === '/')
          assetPath = program.indexPage;
        else
          assetPath = path.join(program.baseDir, req.path);

        if (_.contains(watchedFiles, assetPath) === false) {
          log.debug("Watching file %s for changes", assetPath);
          watcher.add(assetPath);
          watchedFiles.push(assetPath);
        } 
      }

      onFinished(res, function() {
        // Write each request to the log in a format that emulates NPM
        log.writeln({
          process: 'yoke', 
          status: res.statusCode, 
          color: res.statusCode === 200 ? 'green' : 'magenta',
          message: "Serving " + req.path
        });
      });

      next();
    });

    localhost.get('/', function(req, res, next) {
      // TODO: Look for the best index page. If it's .jade or .haml compile them on the fly
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

  function setDefaults() {
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
      return new Error("Invalid build option value. Valid values are 'debug' and 'release'");
    }

    // If an explicit baseDir was specified for the current build type, ensure it exists.
    if (_.isObject(program.baseDirs) && !_.isEmpty(program.baseDirs[program.build])) {
      var dir = path.join(program.cwd, program.baseDirs[program.build]);

      if (!fs.existsSync(dir)) {
        return new Error(util.format("The %s directory %s specified in package.json does not exist.", 
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

      program.baseDir = takeFirstExisting(program.cwd, baseDirConventions[program.build], program.cwd);
    } 

    // Find the index page
    var indexPageNames = ['index.html', 'index.haml', 'index.jade'];
    program.indexPage = takeFirstExisting(program.baseDir, indexPageNames);
    if (!program.indexPage) {
      return new Error(util.format("Could not find any of the following pages in %s: %s", 
        JSON.stringify(indexPageNames), program.baseDir));
    }
  }

  // Return the first file or directory that exists.
  function takeFirstExisting(baseDir, candidates, fallback) {
    for (var i=0; i<candidates.length; i++) {
      var dir = path.join(baseDir, candidates[i]);
      if (fs.existsSync(dir))
        return dir;
    }
    // If none of the candidate dirs exist, use the current directory.
    return fallback;
  }
};
