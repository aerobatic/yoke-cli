var chalk = require('chalk');
var util = require('util');
var figures = require("figures");

module.exports.debug = function() {
  if (process.env.YOKE_DEBUG === '1')
    process.stderr.write('yoke ' + chalk.magenta('debg') + ' ' + chalk.dim(util.format.apply(this, arguments)) + '\n');
};

module.exports.error = function() {
  // TODO: Report each line of the error stack as a separate line like NPM
  process.stderr.write("yoke " + chalk.bgRed('ERR!') +  ' ' + util.format.apply(this, arguments) + '\n');
};

module.exports.warn = function() {
  process.stdout.write("yoke " + chalk.bgYellow("WARN") + ' ' + util.format.apply(this, arguments) + '\n');
}

module.exports.progress = function() {
  process.stdout.write("yoke " + chalk.green("info") + ' ' + chalk.dim(util.format.apply(this, arguments)) + '\n');
};

module.exports.success = function() {
  process.stdout.write("yoke " + chalk.bgGreen(" OK!") + " " + chalk.green.bold(util.format.apply(this, arguments)) + '\n');
};

module.exports.blankLine = function() {
  process.stdout.write('\n');
}