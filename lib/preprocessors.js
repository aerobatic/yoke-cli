var jade = require('jade');
var fs = require('fs');
var path = require('path');
var stylus = require('stylus');

module.exports = {
  jade: function(filename, callback) {
    var html = jade.renderFile(filename, {pretty: true});
    callback(null, {
      contentType: 'text/html',
      output: html
    });
  },

  styl: function(filename, callback) {
    fs.readFile(filename, function(err, str) {
      if (err) return callback(err);

      stylus(str.toString())
        .set('filename', filename)
        .include(require('nib').path)
        .render(function(err, css) {
          if (err) return callback(err);

          callback(null, {
            contentType: 'text/css',
            output: css
          });
        });
    });
  }
}