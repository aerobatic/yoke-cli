var inquirer = require('inquirer'),
  chalk = require('chalk'),
  fs = require('fs'),
  path = require('path'),
  osenv = require('osenv'),
  async = require('async'),
  log = require('../lib/log');

module.exports = function(program, done) {
  var aerobaticDotFile = path.join(osenv.home(), '.aerobatic');

  var asyncTasks = [], existingUserId, credentialsJson;

  asyncTasks.push(readExistingCredentials);
  asyncTasks.push(promptForInputs);
  asyncTasks.push(writeAerobaticDotFile);

  async.series(asyncTasks, function(err) {
    if (err) return done(err);

    log.success("Your credentials have been stored. You can now use all the yoke commands.");
    done();
  });

  function readExistingCredentials(callback) {
    fs.readFile(aerobaticDotFile, function(err, contents) {
      var json;
      if (err) return callback();

      var json;
      try {
        json = JSON.parse(contents);
      }
      catch (err) {
        json = {};
      }

      existingUserId = json.userId;
      callback();
    });
  }

  function promptForInputs(callback) {
    var questions = [
      {
        type:'input',
        name:'userId',
        default: existingUserId,
        validate: function(input) {
          if (/^[a-z0-9\-\_]+$/i.test(input) === false)
            return "Value contains invalid characters.";
          else
            return true;
        },
        message: 'userId'
      },
      {
        type: 'password',
        name: 'secretKey',
        validate: function(input) {
          if (/^[a-z0-9]+$/i.test(input) === false)
            return 'Value contains invalid characters.';
          else if (input.length !== 32)
            return 'Value is ' + input.length + ' characters long. Must be 32 characters.';
          else
            return true;
        },
        message: 'secretKey'
      }
    ];

    log.messageBox(['Login to Aerobatic',
      'You can access your userId and secretKey on your profile page:',
      'https://portal.aerobaticapp.com/profile']);

    inquirer.prompt(questions, function(answers) {
      credentialsJson = answers;
      log.blankLine();

      callback();
    });
  }

  function writeAerobaticDotFile(callback) {
    // Write the values to the .aerobatic file
    log.info("Writing userId and secretKey to file: %s", aerobaticDotFile);
    fs.writeFile(aerobaticDotFile, JSON.stringify(credentialsJson), callback);
  }
};
