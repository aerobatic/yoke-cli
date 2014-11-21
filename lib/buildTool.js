var fs = require('fs');
var _ = require('lodash');
var path = require('path');
var spawn = require('child_process').spawn;
var log = require('./log');

// var gruntCli = require('grunt').cli;

module.exports = function(tasks, options, callback) {
  _.defaults(options, {
    cwd: process.cwd()
  });

  // Look for either a Gruntfile or Gulpfile. In the future could be a Brocfile.
  determineBuildTool(options, function(err, buildTool) {
    if (err) return callback(err);
    if (!buildTool)
      return callback(null);

    if (_.isString(tasks))
      tasks = [tasks];

    // Run the specified task on the 
    var spawnOptions = {};
    
    // If we aren't normalizing the output, then just inherit
    if (options.normalizeStdio !== true)
      spawnOptions.stdio = 'inherit';

    log.info("Running %s %s", buildTool, tasks);
    var child = spawn(buildTool, tasks);
    if (options.normalizeStdio) {
      child.stdout.on('data', function(data) {
        var message = fixChildProcessOut(data.toString());
        if (_.isEmpty(message) === false)
          log.writeln({process: buildTool, message: message});
      });

      child.stderr.on('data', function(data) {
        log.writeln({process: buildTool, status: 'ERR!', color:'bgRed', message: data.toString()});
        // log.error(data.toString());
      });
    }

    child.on('exit', function(code, signal) {
      if (code !== 0)
        return callback(Error.create("Error returned from " + buildTool, {tasks: tasks, code: code}));

      callback();
    });
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

function determineBuildTool(options, callback) {
  // TODO: What about .coffee files?
  fs.exists(path.join(options.cwd, 'Gruntfile.js'), function(exists) {
    if (exists)
      return callback(null, 'grunt');

    fs.exists(path.join(options.cwd, 'gulpfile.js'), function(exists) {
      if (exists)
        return callback(null, 'gulp');

      log.warn("Could not find either a Gruntfile.js or gulpfile.js");

      callback(null);
      // return callback(new Error("Could not find either a Gruntfile.js or Gulpfile.js"));
    });
  });
}