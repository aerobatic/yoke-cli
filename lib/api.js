var request = require('request');
var _ = require('lodash');
var manifest = require('../package.json');
var log = require('./log');

module.exports = function(program, options, callback) {
  _.defaults(options, {
    method: 'post',
    headers: {},
    json: true,
    strictSSL: true
  });

  if (program.apiUrl)
    options.url = program.apiUrl + options.path;
  else if (program.dev === true) {
    options.url = 'https://aerobaticapp.dev:7777' + options.path;
    options.strictSSL = false;
  }
  else
    options.url = 'https://aerobaticapp.com' + options.path;

  _.extend(options.headers, {
    "User-Agent": 'yoke-cli@' + manifest.version,
    "Authorization": "Basic " + new Buffer(program.userId + ':' + program.secretKey).toString('base64'),
    "Accept": "application/json"
  });

  log.debug("API request to " + options.url);
  return request(options, function(err, resp, body) {
    if (err)
      return callback(err);

    switch (resp.statusCode) {
      case 200:
      case 201:
      case 202:
        return callback(null, body, resp.statusCode);

      case 401: 
        return callback(new Error("Unauthorized. Your userId and secretKey do not allow you to perform the requested action."));
      case 404:
        return callback(null, null, 404);
      case 500:
      default:
        return callback(Error.http(resp.statusCode, err.message));
    }
  });
};