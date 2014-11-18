var fs = require('fs');
var _ = require('lodash');
var spawn = require('child_process').spawn;
var log = require('./log');

// var gruntCli = require('grunt').cli;

var buildTools = {
  grunt: function(tasks, callback) {
    gruntCli.tasks = tasks;
    gruntCli({}, function() {
      callback(); 
    });
  },
  gulp: function(tasks, callback) {
    callback();
  }
};

module.exports = function(tasks, options, callback) {
  // Look for either a Gruntfile or Gulpfile. In the future could be a Brocfile.
  determineBuildTool(function(err, buildTool) {
    if (err) return callback(err);

    if (_.isString(tasks))
      tasks = [tasks];

    // Run the specified task on the 
    var spawnOptions = {};
    
    // If we aren't normalizing the output, then just inherit
    if (options.normalizeStdio !== true)
      spawnOptions.stdio = 'inherit';

    var child = spawn(buildTool, tasks);
    if (options.normalizeStdio) {

      child.stdout.on('data', function(data) {
        var message = fixChildProcessOut(data.toString());
        if (_.isEmpty(message) === false)
          log.writeln({process: buildTool, message: message});
      });

      child.stderr.on('data', function(data) {
        log.writeln({process: buildTool, status: 'ERR!', color:'bgRed', message: data.toString()});
        log.error(data.toString());
      });
    }

    // buildTools[buildTool](tasks, callback);
  });
};

function fixChildProcessOut(msg) {
  // Strip off any trailing linebreaks
  // u001b[4mRunning "watch" task\u001b[24m

  // Strip off unicode formatting codes
  msg = msg.replace(/\u001b\[\d+m/g, "");
  msg = msg.replace(/^>>/, "");
  msg = msg.trim(msg);
  return msg.trim(msg);
}

function normalizeGruntStdout(message) {
  //
}

function normalizeGulpStdout(message) {

}

function determineBuildTool(callback) {
  // TODO: What about .coffee files?
  fs.exists('Gruntfile.js', function(exists) {
    if (exists)
      return callback(null, 'grunt');

    fs.exists('gulpfile.js', function(exists) {
      if (exists)
        return callback(null, 'gulp');

      return callback(new Error("Could not find either a Gruntfile.js or Gulpfile.js"));
    });
  });
}