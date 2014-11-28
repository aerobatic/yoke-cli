var spawn = require('child_process').spawn;
var _ = require('lodash');
var log = require('./log');

// Execute a child process.
module.exports = function(cmd, args, options, callback) {
  if (_.isFunction(options)) {
    callback = options;
    options = {};
  }

  _.defaults(options, {
    waitForExit: true,
    cwd: process.cwd,
    inheritStdio: false
  });

  var spawnOptions = {
    cwd: options.cwd,
    stdio: options.inheritStdio ? 'inherit' : 'pipe'
  };

  log.debug("Spawning child process %s %s", cmd, args)
  var childProcess = spawn(cmd, args, spawnOptions);

  if (options.normalizeStdio !== true)
    spawnOptions.stdio = 'inherit';

  childProcess.on('error', function(err) {
    return callback(err);
  });

  if (options.inheritStdio !== true) {
    childProcess.stdout.on('data', function(data) {
      var message = fixChildProcessOut(data.toString());
      if (_.isEmpty(message) === false)
        log.writeln({process: cmd, message: message});
    });

    childProcess.stderr.on('data', function(data) {
      log.writeln({process: cmd, status: 'ERR!', color:'bgRed', message: data.toString()});
    });
  }

  if (options.waitForExit === true) {
    childProcess.on('exit', function(code, signal) {
      if (code !== 0)
        return callback(Error.create("Error returned from " + cmd, {code: code}));

      callback();
    });  
  }
  else
    callback();
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