var inquirer = require('inquirer'),
  chalk = require('chalk'),
  fs = require('fs'),
  path = require('path'),
  osenv = require('osenv'),
  log = require('../lib/log');

module.exports = function(program, done) {
  var questions = [
    {
      type:'input', 
      name:'userId', 
      validate: function(input) {
        return /[a-z0-9-+]{10}/.test(input) || "Value should be 10 characters long";
      },
      message: 'userId'
    },
    {
      type: 'input',
      name: 'secretKey',
      validate: function(input) {
        if (/^[a-z0-9]+$/i.test(input) === false)
          return 'Value can only contain lowercase letters and numbers';
        else if (input.length != 30)
          return 'Value is ' + input.length + ' characters long. Must be 20 characters.';
        else
          return true;
      },
      message: 'secretKey'
    }
  ];

  console.log("You can access your userId and secretKey on your Aerobatic profile:")
  console.log("https://portal.aerobaticapp.com/profile");

  inquirer.prompt(questions, function( answers ) {
    // Write the values to the .aerobatic file
    var file = path.join(osenv.home(), '.aerobatic');
    
    log.progress("Writing userId and secretKey to file: " + file);
    log.progress("You can now make API calls from the yoke CLI");

    fs.writeFile(file, JSON.stringify(answers), done);
  });
};