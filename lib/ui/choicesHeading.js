/**
 * Separator object
 * Used to space/separate choices group
 */

var chalk = require("chalk");
var figures = require("figures");


/**
 * Module exports
 */

module.exports = Separator;


/**
 * Separator object
 * @constructor
 * @param {String} line   Separation line content (facultative)
 */

function Separator(heading) {
  this.type = "separator";
  var horiz = new Array(8).join(figures.line);
  this.line = chalk.dim(horiz + ' ' + heading + ' ' + horiz);
}


/**
 * Helper function returning false if object is a separator
 * @param  {Object} obj object to test against
 * @return {Boolean}    `false` if object is a separator
 */

Separator.exclude = function( obj ) {
  return obj.type !== "separator";
};


/**
 * Stringify separator
 * @return {String} the separator display string
 */

Separator.prototype.toString = function() {
  return this.line;
};