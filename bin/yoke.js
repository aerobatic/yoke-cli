#!/usr/bin/env node

var program = require('commander');
var chalk = require('chalk');
var inquirer = require('inquirer');
var osenv = require('osenv');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var async = require('async');
var log = require('../lib/log');
var updateNotifier = require('update-notifier');
var pkg = require('../package.json');

require('simple-errors');

updateNotifier({
  packageName: pkg.name,
  packageVersion: pkg.version,
  updateCheckInterval: 1000 * 60 * 60 * 2 // Check for updates every 2 hours
}).notify();

program.version(require('../package.json').version)
  .option('-d, --debug', 'Emit debug messages')
  .option('-u, --userId [userId]', 'User id. If not provided the credentials in the .aerobatic file are used')
  .option('-k, --secretKey [secretKey]', 'User secret key')
  .option('-p, --port [portNumber]', 'Port number to listen on')
  .option('--dev', 'Run yoke against the development environment')
  .option('--offline', 'Indicate that your are offline')

program
  .command('login')
  .description("Write the login credentials")
  .action(commandAction('login', {requireCredentials: false, loadNpmConfig: false}));

program
  .option('--github-repo [repo]', 'GitHub repo to scaffold a new app from. Specify owner/repoName')
  .option('--github-branch [branch]', 'GitHub branch (only relevant if github-repo specified)')
  .command('create-app')
  .description('Create a new Aerobatic app')
  .action(commandAction('appCreate', {loadNpmConfig:false}));

program
  .command('bind-app')
  .description('Bind the current directory to an existing Aerobatic app')
  .action(commandAction('appBind', {loadNpmConfig:false}));

program
  .option('-o, --open', 'Open a browser to the local server')
  .option('--release', 'Run in release mode')
  .command('serve')
  .description("Run a localhost instance of the app")
  .action(commandAction('serve'));

program
  // .option('-o, --open', 'Open a browser to the simulator host')
  .command('sim')
  .description("Run the simulator server")
  .action(commandAction('serve', {simulator: true}));

program
  .option('-x, --unattended', 'Run in unattended mode')
  .option('--version-name [versionName]', 'Version name')
  .option('-m, --message [message]', 'Version message')
  .option('-f, --force', 'Force all production traffic to the new version')
  .option('--appId [appId]', 'Set appId (in place of the one defined in package.json')
  .command('deploy')
  .description('Deploy a new version of the app')
  .action(commandAction('deploy'));

program
  .command('*')
  .action(function(env){
    log.error("Not a valid command. Type 'yoke -h' for help.")
    process.exit();
  });

program.parse(process.argv);

process.on('exit', function(code) {

  log.info("Exiting");
});

function commandAction(name, options) {
  // Extend any options from program to options.
  return function() {
    _.extend(program, _.defaults(options || {}, {
      requireCredentials: true,
      loadNpmConfig: true
    }));

    var initTasks = {};

    // If login is required to run this command and the user and key were
    // not passed in as arguments, then look up the .aerobatic file.
    if (program.requireCredentials === true && !(program.userId && program.secretKey)) {
      initTasks.credentials = loadCredentials;
    }

    if (program.loadNpmConfig) {
      initTasks.config = loadAerobaticNpmConfig;
    }

    async.parallel(initTasks, function(err, results) {
      if (err) {
        if (err instanceof Error)
          log.error(err.stack || err.toString());
        else if (_.isString(err))
          log.error(err);

        process.exit();
      }

      // Extend program with the values.
      _.each(results, function(value, key) {
        _.extend(program, value);
      });

      setProgramDefaults();

      require('../commands/' + name)(program, function(err, onKill) {
        if (err) {
          if (err instanceof Error)
            log.error(err.stack || err.toString());
          else if (_.isString(err))
            log.error(err);

          process.exit();
        }

        // Don't shutdown the process if keepAlive is specified.
        //TODO: Could we print a message in the bottom bar with a message for how to stop?
        if (!_.isFunction(onKill))
          process.exit();
        else {
          // Wait for SIGINT to cleanup the command
          process.on('exit', function() {
            onKill();
          });
        }
      });
    });
  };
}

function setProgramDefaults() {
  // Default the base directories to the current directory
  if (program.debug)
    process.env.YOKE_DEBUG = '1';
  if (program.dev)
    process.env.AEROBATIC_ENV = 'dev';
}

function loadCredentials(callback) {
  var aerobaticDotFile = path.join(osenv.home(), '.aerobatic');
  log.debug("Loading credentials from %s", aerobaticDotFile);

  // TODO: Check that .aerobatic file doesn't have overly permissive access similar to how openSSH does.
  fs.exists(aerobaticDotFile, function(exists) {
    if (!exists)
      return callback("No .aerobatic file exists. First run 'yoke login'");

    var credentials;
    try {
      credentials = JSON.parse(fs.readFileSync(aerobaticDotFile));
    }
    catch (e) {
      return callback("Could not parse .aerobatic file JSON. Try re-running 'yoke login'");
    }

    if (_.isEmpty(credentials.userId) || _.isEmpty(credentials.secretKey))
      return callback("Missing information in .aerobatic file. Try re-running 'yoke login'");

    log.debug("Credentials loaded, userId=%s", credentials.userId);
    callback(null, credentials);
  });
}

function loadAerobaticNpmConfig(callback) {
  var packageJsonPath = path.join(process.cwd(), 'package.json');

  fs.exists(packageJsonPath, function(exists) {
    if (!exists)
      return callback("File " + packageJsonPath + " does not exist. Run 'npm init' to create it.");

    fs.readFile(packageJsonPath, function(err, contents) {
      if (err) return callback(err);

      var json;
      try {
        json = JSON.parse(contents);
      }
      catch (e) {
        return callback("File " + packageJsonPath + " is not valid JSON");
      }

      if (!json._aerobatic)
        return callback("Missing _aerobatic section in package.json file. Try re-running the command 'yoke app:bind'.");

      var aerobaticConfig = json._aerobatic;

      if (!program.appId && !aerobaticConfig.appId)
        return callback("Missing appId in _aerobatic section of package.json. Try re-running the command 'yoke bind-app'.");

      if (program.appId) {
        aerobaticConfig.appId = program.appId;
      }

      // Copy certain NPM standard attributes to the _aerobatic section.
      _.extend(aerobaticConfig, {
        appVersion: json.version,
        npmScripts: json.scripts || {}
      });

      callback(null, aerobaticConfig);
    });
  });
}