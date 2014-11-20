var path = require('path');
var fs = require('fs');
var log = require('./log');


// Write the _aerobatic config section to package.json. If file doesn't exist
// create a new package.json from scratch.
module.exports = function(appDir, app, callback) {
  // If there isn't a package.json file, create one. Otherwise modify it adding the aerobatic section.
  var packageJsonPath = path.join(appDir, 'package.json');
  fs.exists(packageJsonPath, function(exists) {
    if (!exists) {
      log.info("Writing file %s", packageJsonPath);
      fs.writeFile(packageJsonPath, JSON.stringify({
        name: app.name,
        version: "0.0.0",
        _aerobatic: {
          appId: app.appId
        }
      }, null, 2), callback);
    }
    else {
      // If the package.json file already exits, modify it by adding an _aerobatic section
      log.info("Updating file %s", packageJsonPath);
      fs.readFile(packageJsonPath, function(err, json) {
        if (err) return callback(err);

        var packageJson;
        try {
          packageJson = JSON.parse(json);
        }
        catch (e) {
          return callback(Error.create("package.json is invalid"));
        }

        packageJson['_aerobatic'] = {appId: app.appId};
        fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), callback);
      });
    }
  });
};