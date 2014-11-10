var chalk = require('chalk');
var util = require('util');
var figures = require("figures");

module.exports.debug = function() {
  if (process.env.YOKE_DEBUG === '1')
    process.stderr.write('yoke ' + chalk.magenta('debg') + ' ' + chalk.gray(util.format.apply(this, arguments)) + '\n');
};

module.exports.error = function() {
  process.stderr.write("yoke " + chalk.bgRed('ERR!') +  ' ' + chalk.red(util.format.apply(this, arguments)) + '\n');
};

module.exports.progress = function() {
  process.stdout.write("yoke " + chalk.green("info") + ' ' + chalk.dim(util.format.apply(this, arguments)) + '\n');
};

module.exports.success = function() {
  process.stdout.write(chalk.green(figures.tick + ' ' + chalk.bold(util.format.apply(this, arguments))) + '\n');
};