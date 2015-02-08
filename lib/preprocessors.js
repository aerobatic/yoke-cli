var jade = require('jade');
var fs = require('fs');
var path = require('path');
var stylus = require('stylus');
// var browserify = require('browserify');
// var reactify = require('reactify');

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
  
  // Browserify bundle
  // jsbundle: function(filename, callback) {    
  //   // In the case of browserify the filename is not app.jsbundle but app.js
  //   var realFilename = path.join(path.dirname(filename), path.basename(filename, '.jsbundle') + '.js');
  //   // debugger;

  //   var b = browserify({
  //     // debug: true, 
  //     extensions: ['.jsx']
  //   });

  //   // https://github.com/i-like-robots/react-tube-tracker
  //   b.transform(reactify);
  //   b.add(realFilename);

  //   callback(null, {
  //     contentType: 'text/javascript',
  //     output: b.bundle()
  //   })
  // }
}