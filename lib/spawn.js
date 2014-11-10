var spawn = require('child_process').spawn;
var _ = require('lodash');

// Execute a child process.
module.exports = function(cmd, args, cwd, callback) {
  if (_.isFunction(cwd)) {
    callback = cwd;
    cwd = process.cwd();
  }

  var childProcess = spawn(cmd, args, {
    cwd: cwd,
    stdio: 'inherit'
  });

  childProcess.on('error', function(err) {
    return callback(err);
  });

  childProcess.on('exit', function(code, signal) {
    if (code !== 0)
      return callback(Error.create("Error returned from process", {cmd: cmd, code: code}));

    callback();
  });
}