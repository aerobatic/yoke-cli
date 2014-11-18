var chalk = require('chalk');
var util = require('util');
var _ = require('lodash');
var printf = require('printf');

module.exports.debug = function() {
  if (process.env.YOKE_DEBUG === '1')
    log({message: util.format.apply(this, arguments), status: 'debug', color: 'magenta'});
};

module.exports.error = function() {
  log({message: util.format.apply(this, arguments), status:'ERR!', color: 'bgRed'});
};

module.exports.warn = function() {
  log({
    message: util.format.apply(this, arguments), 
    status:'WARN', 
    color: 'yellow'
  });
}

module.exports.info = function() {
  log({message: util.format.apply(this, arguments), status:'info', color: 'green'});
};

module.exports.success = function() {
  log({message: chalk.green.bold(util.format.apply(this, arguments)), status:'OK!', color: 'bgGreen'});

  // process.stdout.write("yoke " + chalk.bgGreen(" OK!") + " " + chalk.green.bold(util.format.apply(this, arguments)) + '\n');
};

module.exports.http = function(statusCode, urlPath) {
  process.stdout.write("yoke " + chalk.green(statusCode) + " " + urlPath + "\n");
}

module.exports.writeln = function(options) {
  log(options);
}

module.exports.blankLine = function() {
  process.stdout.write('\n');
}

function log(options) {
  _.defaults(options, {
    process: 'yoke',
    status: 'info',
    color: 'green'
  });

  options.message.split('\n').forEach(function(line) {
    process.stdout.write(printf("%-6s", options.process));

    var padding = _.map(_.range(6-options.status.toString().length), function() { return ' '}).join('');

    process.stdout.write(chalk[options.color](options.status) + padding);
    process.stdout.write(options.message + '\n');
  });
}