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
var osenv = require('osenv');
var tinylr = require('tiny-lr');
var urlParse = require('url').parse;
var onFinished = require('on-finished');
var chalk = require('chalk');
var spawn = require('../lib/spawn');
var bodyParser = require('body-parser');
var api = require('../lib/api');
var helper = require('../lib/helper');
var indexPage = require('../lib/indexPage');
var preprocessors = require('../lib/preprocessors');
var Gaze = require('gaze').Gaze;

module.exports = function(program, done) {
  var aerobaticApp, watcher, localhostServer, liveReloadServer, watchedFiles = [], simulatorUrl;

  if (program.simulator === true)
    log.messageBox("Run a local server for assets while index page runs on simulator host.\nPress Ctrl+C to quit.");
  else {
    program.simulator = false;
    log.messageBox("Run a full localhost server.\nPress Ctrl+C to quit.");
  }

  var asyncTasks = [];
  asyncTasks.push(function(cb) {
    // Fetch the app from the API so we have access to the env variables.
    log.info("Fetching app info from Aerobatic API");
    api(program, {method: 'GET', path: '/api/apps/' + program.appId}, function(err, app) {
      if (err) return cb(err);

      // Apps with oauth enabled need to be run in simulator mode.
      if (app.authConfig && app.authConfig.type === 'oauth' && program.simulator !== true) {
        return cb("This app has OAuth enabled. Development of this app should happen in simulator mode. Try running 'yoke sim' instead.");
      }

      aerobaticApp = app;
      cb();
    });
  });

  asyncTasks.push(setDefaults);

  // If serving in release mode, run the build step first.
  asyncTasks.push(function(cb) {
    if (program.build === 'release' && program.npmScripts.build)

      spawn('npm', ['run-script', 'build'], cb);
    else
      cb();
  });

  asyncTasks.push(verifyIndexPages);

  if (program.simulator === true) {
    // If this is simulator mode, upload the index pages to the simulator host.
    asyncTasks.push(function(cb) {
      uploadIndexPageToSimulator([program.indexPage, program.loginPage], cb);
    });
  }

  asyncTasks.push(function(cb) {
    if (program.npmScripts.watch) {
      log.debug("Found npm watch script");
      spawn('npm', ['run-script', 'watch'], {waitForExit: false}, cb);
    }
    else
      cb();
  });

  asyncTasks.push(function(cb) {
    // Start the localhost server
    startLocalServer(function(localhostUrl) {
      if (program.simulator === true) {
        simulatorUrl = buildSimulatorUrl();
        log.info("App running at %s", simulatorUrl);        
      }
      else
        log.info("App running at %s", localhostUrl);

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
      // TODO: Should we delay starting the watcher briefly to give
      // the grunt or gulp watch initialize to modify some files. Otherwise
      // we could get an immediete livereload refresh.

      // Defaulting to poll mode as native was observed to fail silently even
      // though it is supposed to automatically fallback to polling. Allow
      // this to be overridden in package.json in the _aerobatic section.
      var gazeOptions = {
        maxListeners: 100,
        mode: program.watchMode === 'auto' ? 'auto' : 'poll'
      };

      watcher = new Gaze(indexPages, gazeOptions, function() {
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
      else if (watchedFiles[filePath])
        assetUrlPath = watchedFiles[filePath];

      if (assetUrlPath) {
        //TODO: What if several files all changed at once.. We should buffer
        //them up and send just one notification to livereload.
        program.lastFileChanges = [filePath];

        // if (program.simulator === true)
        log.info("Livereload triggered by change to %s", assetUrlPath);
        tinylr.changed(assetUrlPath);
      }
    }
  }

  function uploadIndexPageToSimulator(indexPage, callback) {
    if (_.isString(indexPage))
      indexPage = [indexPage];
    indexPage = _.compact(indexPage);

    var requestOptions = {
      method: 'POST',
      path: '/dev/' + program.appId + '/simulator',
      formData: {}
    };

    async.each(indexPage, function(pagePath, cb) {
      var extname = path.extname(pagePath);
      var pageName = path.basename(pagePath, extname);

      log.debug("Uploading index page %s to simulator", pagePath);

      // If this extension has a pre-processor registered, perform preprocessing first.
      preProcessor = preprocessors[extname.substr(1)];
      if (preProcessor) {
        preProcessor(pagePath, function(err, result) {
          if (err) return cb(err);

          //HACK: Write the .html file to disk. Can't seem to mimic a read stream from a string.
          var tempFile = path.join(osenv.tmpdir(), new Date().getTime() + '.html');
          fs.writeFile(tempFile, result.output, function(err) {
            if (err) return cb(err);

            requestOptions.formData[pageName] = fs.createReadStream(tempFile);
            cb(null);
          });
        });
      }
      else {
        requestOptions.formData[pageName] = fs.createReadStream(pagePath);
        cb(null);
      }
    }, function(err, formValues) {
      if (err) return callback(err);
      api(program, requestOptions, callback);
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

    // The proxy is not enabled in localhost server mode.
    localhost.get('/proxy', function(req, res, next) {
      log.error("Cannot call the proxy in localhost mode. Run 'yoke sim' instead.")
      res.status(403).send("Cannot call the proxy in localhost mode. Run 'yoke sim' instead");
    });

    localhost.use(function(req, res, next) {
      log.debug("Request for %s", req.path);

      onFinished(res, function() {
        if (res.statusCode === 500)
          return done("Cannot use the proxy in localhost mode. Run 'yoke sim' instead.");

        // Write each request to the log in a format that emulates NPM
        log.writeln({
          process: 'yoke',
          status: res.statusCode,
          color: res.statusCode === 200 ? 'green' : 'magenta',
          message: "Serving " + req.path
        });
      });

      // If the request path has no file extension, then assume it is the index page.
      req.indexPage =  /\.[a-z]+$/.test(req.path) === false;
      req.vendorAsset = /^\/(node_modules|bower_components)\//.test(req.path) === true;

      // Make sure the path is in the list of files to watch.
      if (program.livereload && !req.vendorAsset) {
        // Watch any file that is requested by the page.
        var assetPath;
        if (req.indexPage)
          assetPath = program.indexPage;
        else {
          var pathSplit = req.path.split('.');
          // Slice off all but the first extension. An additional extension can be added 
          // to certain filetype so the browser sees them with the expected extension but
          // the actual filename does not include it, i.e. styles.styl.css.
          var filePath;
          if (pathSplit.length > 2 && preprocessors[pathSplit[1]])
            filePath = pathSplit.splice(0, 2).join('.');
          else
            filePath = req.path;

          assetPath = path.join(program.baseDir, filePath);
        }

        if (!watchedFiles[assetPath]) {
          watcher.add([assetPath], function() {
            log.debug("Added watch to file %s", assetPath);
            watchedFiles[assetPath] = req.path;
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
      next();
    });

    localhost.use(function(req, res, next) {
      // If the path has a file extension, go onto the next middleware.
      if (req.indexPage === true) {
        // Serve up the index page.
        indexPage(program.indexPage, aerobaticApp, program, function(err, html) {
          if (err) return next(err);

          res.set('Content-Type', 'text/html');
          res.send(html);
        });
      }
      else
        next();
    });

    localhost.use(cors());

    // Serve requests for bower_components or node_modules from the root
    // of the project directory structure.
    // TODO: Need to read .bowerrc file for alternative name for components dir
    var rootServer = express.static(program.cwd, {index: false});
    localhost.use(function(req, res, next) {
      if (req.vendorAsset === true)
        rootServer(req, res, next);
      else
        next();
    });

    localhost.use(function(req, res, next) {
      // Check if the request is for a file extension that has a pre-processor configured
      // The path will look like styles.styl.css
      var pathSplit = req.path.split('.');
      if (pathSplit.length === 1)
        return next();

      var extname = pathSplit[1];
      var preProcessor = preprocessors[extname];
      if (!preProcessor)
        return next();

      var filePath = path.join(program.baseDir, pathSplit[0] + '.' + extname);
      log.debug("Running preprocessor %s on file %s", extname, filePath);
      preProcessor(filePath, function(err, result) {
        if (err) {
          log.error(err.message);
          return res.status(500).send(err.message);
        }

        res.set('Content-Type', result.contentType);
        return res.send(result.output);
      });
    });

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
      log.debug("Starting localhost server on port %s", program.port);
      localhostServer = http.createServer(localhost).listen(program.port, function() {
        var url = "http://localhost:" + program.port;
        callback(url);
      });
    }
  }

  function setDefaults(callback) {
    _.defaults(program, {
      port: 3000,
      livereload: true,
      // Intentionally not using standard livereload port to avoid collisions if
      // the app is also using a browser livereload plugin.
      livereloadPort: 35728,
      cwd: process.cwd(),
      baseDirs: {},
      build: 'debug'
    });

    if (program.release === true)
      program.build = 'release';

    // Verify that the build type is valid.
    if (_.contains(['debug', 'release'], program.build) === false) {
      return callback("Invalid build option value. Valid values are 'debug' and 'release'.");
    }

    callback();
  }

  function verifyIndexPages(callback) {
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
    var indexPageNames = ['index.html', 'index.jade']; //, 'index.haml', ];
    program.indexPage = helper.takeFirstExistsPath(program.baseDir, indexPageNames);
    if (!program.indexPage) {
      return callback(util.format("Could not find any of the following pages in %s: %s",
        program.baseDir, JSON.stringify(indexPageNames)));
    }
    else
      log.debug("Using index page %s", program.indexPage);

    var loginPageNames = ['login.html', 'login.jade'];
    if (aerobaticApp.authConfig && _.contains(['oauth', 'parse'], aerobaticApp.authConfig.type)) {
      program.loginPage = helper.takeFirstExistsPath(program.baseDir, loginPageNames);
      if (!program.loginPage) {
        return callback(util.format("Apps with %s enabled require a login page. None of the following pages exist in %s: %s",
          aerobaticApp.authConfig.type, JSON.stringify(loginPageNames), program.baseDir));
      }
      else
        log.debug("Using login page %s", program.loginPage);
    }
    
    callback(null);
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
