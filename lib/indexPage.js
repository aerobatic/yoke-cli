var cheerio = require('cheerio');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var log = require('./log');
var preprocessors = require('./preprocessors');


module.exports = function(indexPagePath, app, options, callback) {
  _.defaults(options, {
    build: 'debug',
    livereloadPort: 35729
  });

  fs.exists(indexPagePath, function(exists) {
    if (!exists) return callback(new Error("Index page " + path + " does not exist"));

    loadHtml(indexPagePath, function(err, html) {
      if (err) return callback(err);

      var $;
      try {
        $ = cheerio.load(html, {recognizeSelfClosing: true});
      }
      catch (err) {
        return callback(new Error("Invalid index document: " + err.message));
      }

      // Strip any blocks that belong to a different build
      $('[data-aero-build]').each(function() {
        var elem = $(this);
        if (elem.attr('data-aero-build') !== options.build)
          elem.remove();
      });

      var head = $.root().find('head');

      // Append the __aerobatic__ script to the head
      head.append($(buildConfigScript()));

      var body = $.root().find('body');

      // Append the livereload script to the bottom of the body tag
      if (options.livereload)
        body.append($('<script src="//localhost:' + options.livereloadPort + '/livereload.js"></script>'))

      var transformedHtml = $.root().html();

      // Use Cheerio to load html DOM
      // Strip out any blocks that don't match current build
      // Inject the livereload script block
      // Expand any glob scripts or css
      callback(null, transformedHtml);
    });  
  });

  function loadHtml(indexPage, callback) {
    var extname = path.extname(indexPagePath).substr(1);

    // Check if there is a pre-processor configured to compile this extension, i.e. jade or haml
    if (preprocessors[extname]) {
      log.debug("Run preprocessor %s on file %s", extname, indexPagePath);
      preprocessors[extname](indexPagePath, function(err, result) {
        if (err) return callback(err);

        callback(null, result.output);
      });
    }
    else
      fs.readFile(indexPage, callback);
  }

  function buildConfigScript() {
    // Build the __aerobatic__ global variable that contains configuration data.
    var clientConfig = {
      appId: app.appId,
      appName: app.name,
      env: {}
    };

    // Gather up the config settings that can be shared with the client.
    if (_.isArray(app.configSettings)) {
      _.each(app.configSettings, function(setting) {
        if (setting.serverOnly !== true)
          clientConfig.env[setting.key] = setting.value;
      });
    }

    _.extend(clientConfig, {
      cdnHost: 'localhost:' + options.port,
      cdnUrl: '//localhost:' + options.port,
      versionId: 'local',
      versionName: 'local',
      appHost: 'localhost',
      buildType: options.build
    });

    return '<script>__aerobatic__ = __config__ = ' + JSON.stringify(clientConfig) + ';</script>';
  }
}