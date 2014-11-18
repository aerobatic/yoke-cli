var cheerio = require('cheerio');
var fs = require('fs');
var _ = require('lodash');

module.exports = function(indexPagePath, app, options, callback) {
  _.defaults(options, {
    build: 'debug',
    livereloadPort: 35729
  });

  fs.exists(indexPagePath, function(exists) {
    if (!exists) return callback(new Error("Index page " + path + " does not exist"));

    // Load the file and replace build blocks with the correct content.
    fs.readFile(indexPagePath, function(err, html) {
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
      appHost: 'localhost'
    });

    return '<script>__aerobatic__ = __config__ = ' + JSON.stringify(clientConfig) + ';</script>';
  }
}