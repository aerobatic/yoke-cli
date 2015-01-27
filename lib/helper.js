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
};

module.exports.parseGithubRepo = function(repo) {
  // Valid forms include:
  // https://github.com/aerobatic/todos-strongloop
  // git@github.com:aerobatic/todos-strongloop.git
  // aerobatic/todos-strongloop
  var repoPatterns = [
    /github\.com\/([a-z_\-]+)\/([a-z_\-]+)/,
    /git\@github.com\:([a-z_\-]+)\/([a-z_\-]+)/,
    /^([a-z_\-]+)\/([a-z_\-]+)/
  ];

  var match;
  for (var i=0; i<repoPatterns.length; i++) {
    match = repo.match(repoPatterns[i]);
    debugger;
    if (match && match.length == 3)
      return match[1] + "/" + match[2];
  }

  return false;
};