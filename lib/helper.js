var async = require('async');
var fs = require('fs');
var path = require('path');

module.exports.takeFirstExistsPath = function(baseDir, candidates, fallback) {
  for (var i=0; i<candidates.length; i++) {
    var dir = path.join(baseDir, candidates[i]);
    if (fs.existsSync(dir))
      return dir;
  }
  // If none of the candidate dirs exist, use the current directory.
  return fallback;
}