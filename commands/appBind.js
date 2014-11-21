var chalk = require('chalk');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var tar = require('tar');
var fs = require('fs');
var path = require('path');
var api = require('../lib/api');
var log = require('../lib/log');
var npmConfig = require('../lib/npmConfig');

require("simple-errors");

module.exports = function(program, done) {
  program = _.defaults(program || {}, {
    inquirer: require('inquirer'),
    cwd: process.cwd()
  });

  log.messageBox("Bind the current directory to an existing Aerobatic app.");

  var asyncTasks = [], organizations, orgId, applications, appId;

  // First read existing config data from package.json
  asyncTasks.push(function(cb) {
    log.debug("Reading aerobatic config from package.json");
    readConfigFromPackageJson(function(err, config) {
      if (err) return cb(err);
      if (config) appId = config.appId;

      cb();
    });
  });

  asyncTasks.push(function(cb) {
    if (!appId)
      return cb();

    // If there is already an appId specified in package.json, ask user to confirm 
    // they want to reinitialize.
    program.inquirer.prompt({
      type: 'confirm',
      name: 'override',
      message: 'This directory is already bound to app ' + appId + '. Are you sure you want to override it?',
    }, function(answer) {
      if (answer.override === false)
        return cb("exit");
      else
        cb();
    });
  });

  asyncTasks.push(function(cb) {
    // Get the user's organizations
    log.debug("Fetching organizations");
    api(program, {method: 'GET', path: '/api/profile/orgs'}, function(err, orgs) {
      if (err) return cb(err);
      organizations = orgs;
      cb();
    });
  });

  asyncTasks.push(function(cb) {
    if (organizations.length == 0)
      return cb();

    var pickOrgQuestion = {
      type: 'list',
      message: "Select the organization the app belongs to",
      choices: _.map(organizations, function(org) {
        return {name: org.name, value: org.orgId};
      }),
      name: 'orgId'
    };

    program.inquirer.prompt(pickOrgQuestion, function(answers) {
      orgId = answers.orgId;
      cb();
    });
  });

  asyncTasks.push(function(cb) {
    var apiPath = orgId ? '/api/orgs/' + orgId + '/apps' : '/api/profile/apps';
    api(program, {path: apiPath}, function(err, apps) {
      if (err) return done(err);

      if (apps.length === 0) {
        log.error("No apps exist. Use 'yoke app:create' to create a new one.");
        return cb('exit');
      }

      applications = apps;
      cb();
    });
  });

  asyncTasks.push(function(cb) {
    var appPickQuestion = {
      type: 'list',
      message: 'Select which application to bind this code to',
      choices: _.map(applications, function(app) {
        return {name: app.name, value: app.appId}
      }),
      name: 'appId'
    };

    program.inquirer.prompt(appPickQuestion, function(answers) {
      appId = answers.appId;
      cb();
    });
  });

  asyncTasks.push(function(cb) {
    // Write the appId to the package.json
    npmConfig(program.cwd, _.find(applications, {appId: appId}), cb);
  });

  async.series(asyncTasks, function(err) {
    if (err) return done(err);

    log.success("App initialized. You can now run 'yoke sim -o' or 'yoke deploy'.");
    done();
  });

  function readConfigFromPackageJson(callback) {
    var packageJsonPath = path.join(program.cwd, 'package.json');

    fs.exists(packageJsonPath, function(exists) {
      if (!exists)
        return callback();

      fs.readFile(packageJsonPath, function(err, contents) {
        if (err) return callback(err);

        var json;
        try {
          json = JSON.parse(contents);
        }
        catch (e) {
          return callback(Error.create("File " + packageJsonPath + " is not valid JSON"));
        }

        callback(null, json._aerobatic);
      });
    });
  }
};