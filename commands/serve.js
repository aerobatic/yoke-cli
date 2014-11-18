var _ = require('lodash');
var express = require('express');
var buildTool = require('../lib/buildTool');
var cors = require('cors');
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
  _.defaults(program, {
    protocol: 'http',
    port: 3000,
    build: 'debug',
    watch: 'watch',
    livereload: true,
    // Intentionally not using standard livereload port to avoid collisions if 
    // the app is also using a browser livereload plugin.
    livereloadPort: 35728 
  });

  // Verify that the build type is valid.
  if (_.contains(['debug', 'release'], program.build) === false) {
    return done(new Error("Valid values for the build option are 'debug' and 'release'"));
  }

  // Default the base directories to the current directory
  if (!program.baseDirs) {
    program.baseDirs = {
      debug: process.cwd(),
      release: process.cwd()
    };
  }

  var aerobaticApp, watcher, liveReloadServer, watchedFiles = [], indexPagePath;
  discoverIndexPage(function(err, pagePath) {
    if (err) return done(err);

    indexPagePath = pagePath;

    // Fetch the app from the API so we have access to the env variables.
    log.info("Fetching app info from Aerobatic API");  
    api(program, {method: 'GET', path: '/api/apps/' + program.appId}, function(err, app) {
      if (err) return done(err);

      // Store the aerobaticApp on the program.
      aerobaticApp = app; 
      aerobaticApp.requireSsl = true;

      if (program.livereload) {
        watcher = watch([indexPagePath]);
        watcher.on('change', onFileChanged);

        // Kick off the watch task for the build tool
        if (program.watch)
          buildTool(program.watch, {normalizeStdio: true});
      }

      startLocalServer(function(url) {
        log.info("App running at %s", url);

        // Open a browser tab with the localhost URL
        if (program.open)
          openBrowser(url);
      });  
    });
  });

  function onFileChanged(watchEvent) {
    log.debug("Change to %s detected", watchEvent.path);

    var assetUrlPath;
    // TODO: If the changed file is index.html and we are in simulator mode, re-upload it
    if (watchEvent.path === indexPagePath)
      assetUrlPath = '/';
    else if (_.contains(watchedFiles, watchEvent.path))
      assetUrlPath = path.relative(program.baseDirs[program.build], watchEvent.path);

    if (assetUrlPath) {
      //TODO: What if several files all changed at once.. We should buffer 
      //them up and send just one notificatio to livereload.
      log.info("Livereload triggered by change to %s", assetUrlPath);
      tinylr.changed(assetUrlPath);
    }    
  }

  function discoverIndexPage(callback) {
    log.debug("Searching for index page");
    // In the future support index.jade and index.haml
    var indexHtml = path.join(program.baseDirs[program.build], 'index.html');
    fs.exists(indexHtml, function(exists) {
      if (exists)
        return callback(null, indexHtml);

      callback(new Error("Missing index page in %s", program.baseDirs[program.build]));
    });
  }

  function startLocalServer(callback) {
    var server = express();

    var serverOptions = {};

    // If the app requires SSL, use a self signed certificate for local development
    if (aerobaticApp.requireSsl === true) {
      _.extend(serverOptions, {
        key: fs.readFileSync(path.join(__dirname, '../certs', 'server.key')).toString(),
        cert: fs.readFileSync(path.join(__dirname, '../certs', 'server.crt')).toString(),
        ca: fs.readFileSync(path.join(__dirname, '../certs', 'ca.crt')).toString(),
        passphrase: 'grunt',
        rejectUnauthorized: false
      });
    }

    server.use(function(req, res, next) {
      // Make sure the path is in the list of files to watch.
      if (program.livereload) {
        // Watch any file that is requested by the page.
        var assetPath;
        if (req.path === '/')
          assetPath = indexPagePath;
        else
          assetPath = path.join(program.baseDirs[program.build], req.path);

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

    server.get('/', function(req, res, next) {
      // TODO: Look for the best index page. If it's .jade or .haml compile them on the fly
      indexPage(indexPagePath, aerobaticApp, program, function(err, html) {
        if (err) return next(err);

        res.set('Content-Type', 'text/html');
        res.send(html);
      });
    });

    server.use(cors());
    server.use(express.static(program.baseDirs[program.build], {index: false}));

    // Create the livereload server
    if (program.livereload) {
      log.debug("Creating livereload server");

      var liveReloadOptions = _.extend(serverOptions, {liveCSS: true, liveImg: true});
      liveReloadServer = tinylr(liveReloadOptions).listen(program.livereloadPort, function() {
        log.info("Livereload listening on port %s", program.livereloadPort);
      });
    }

    // Anything not served by the static middleware is a 404
    server.get('/*', function(req, res) {
      res.status(404).send("Not Found");
    });

    server.use(function(err, req, res, next) {
      return done(err);
    });

    if (aerobaticApp.requireSsl === true) {
      https.createServer(serverOptions, server).listen(program.port, function() {
        var url = "https://localhost:" + program.port;
        callback(url);
      });
    }
    else {
      http.createServer(serverOptions, server).listen(program.port, function() {
        var url = "http://localhost:" + program.port;
        callback(url);
      });
    }
  }
};