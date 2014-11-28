var chalk = require('chalk');
var util = require('util');
var _ = require('lodash');
var printf = require('printf');

module.exports.debug = function() {
  if (process.env.YOKE_DEBUG === '1')
    log({message: util.format.apply(this, arguments), status: 'debug', color: 'magenta'});
};

module.exports.error = function() {
  log({message: util.format.apply(this, arguments), status:'ERR!', color: 'bgRed', messageColor: 'red'});
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

module.exports.messageBox = function(message, options) {
  options = _.defaults(options || {}, {
    width: 80
  });

  if (_.isString(message))
    message = message.split('\n');

  var top = chalk.yellow('┌' + fill('─', options.width) + '┐');
  var bottom = chalk.yellow('└' + fill('─', options.width) + '┘');
  var side = chalk.yellow('│');

  process.stdout.write('\n' + top + '\n');
  message.forEach(function(line) {
    process.stdout.write(side + ' ' + line + fill(' ', options.width - line.length - 1) + side + '\n');
  });
  process.stdout.write(bottom + '\n');
};

function fill(str, count) {
  return Array(count + 1).join(str);
}

function log(options) {
  _.defaults(options, {
    process: 'yoke',
    status: 'info',
    color: 'green'
  });

  if (_.isString(options.message))
    options.message = options.message.split('\n');

  options.message.forEach(function(line) {
    process.stdout.write(printf("%-6s", options.process));

    var padding = _.map(_.range(6-options.status.toString().length), function() { return ' '}).join('');

    process.stdout.write(chalk[options.color](options.status) + padding);
    if (options.messageColor)
      process.stdout.write(chalk[options.messageColor](line) + '\n');
    else
      process.stdout.write(line + '\n');
  });
}