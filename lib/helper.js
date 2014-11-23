var async = require('async');
var fs = require('fs');
var path = require('path');
var log = require('./log');

module.exports.takeFirstExistsPath = function(baseDir, candidates, fallback) {
  for (var i=0; i<candidates.length; i++) {
    var dir = path.join(baseDir, candidates[i]);
    var exists = fs.existsSync(dir);

    log.debug("Existence check for %s: %s", dir, exists);
    if (exists)
      return dir;
  }
  // If none of the candidate dirs exist, use the current directory.
  return fallback;
}