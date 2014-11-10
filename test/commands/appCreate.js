var mocha = require('mocha');
var assert = require('assert');
var path = require('path');
var express = require('express');
var zlib = require('zlib');
var fs = require('fs');
var tarStream = require('tar-stream');
var sinon = require('sinon');
var rimraf = require('rimraf');
var appCreate = require('../../commands/appCreate');  

describe('create app', function() {
  before(function(done) {
    process.env.YOKE_DEBUG = '1';

    this.templates = [
      {
        "title": "test template",
        "buildTools": ["grunt"],
        "gitHubRepo": "aerobatic/test-template"
      }
    ];

    var self = this;
    // Create an express server to simulate npm, GitHub, and bower
    var repoServer = express();
    repoServer.get('/metadata/templates.json', function(req, res) {
      res.send(JSON.stringify({templates: self.templates}));
    });

    repoServer.get('/github/' + this.templates[0].gitHubRepo + '/archive/' + this.templates[0].buildTools[0] + '.tar.gz', function(req, res) {
      // Build a tar file on the fly.
      var pack = tarStream.pack();

      var packageJson = {
        name: 'test',
        version: '0.0.1',
        description: 'description',
        dependencies: {
          dependency: 'http://localhost:9999/npm/dependency.tar.gz'
        }
      };

      pack.entry({ name: 'archive/package.json' }, JSON.stringify(packageJson));

      // TODO: Write a bower.json file

      pack.entry({name: 'archive/index.html'}, "<html></html>");
      pack.finalize();

      res.set('Content-Type', 'application/x-gzip');
      pack.pipe(zlib.createGzip()).pipe(res);
    });

    repoServer.get('/npm/dependency.tar.gz', function(req, res) {
      var pack = tarStream.pack();
      pack.entry({name: 'dependency/package.json'}, JSON.stringify({name: 'dependency', version:'0.0.1', description:'sample module', repository:{}}));
      pack.entry({name: 'dependency/index.js'}, "module.exports={}");
      pack.entry({name: 'depencency/README.md'}, "##README");
      pack.finalize();

      res.set('Content-Type', 'application/x-gzip');
      pack.pipe(zlib.createGzip()).pipe(res);
    });

    repoServer.listen(9999, function() {
      done();
    });
  });

  beforeEach(function() {
    var self = this;

    process.stdout.write('\n');
    this.tmp = path.join(__dirname, '../../tmp');
    rimraf.sync(this.tmp);
    fs.mkdirSync(this.tmp);

    this.appName = 'test-app';

    this.appCreateCommand = appCreate({
      templatesUrl: 'http://localhost:9999/metadata/templates.json',
      gitHubUrl: 'http://localhost:9999/github',
      inquirer: {
        prompt: sinon.spy(function(questions, callback) {
          callback({
            appName: self.appName,
            template: self.templates[0],
            buildTool: 'grunt'
          });
        })
      },
      baseDir: self.tmp
    });
  });

  it('creates app', function(done) {
    var program = {};
    var self = this;
    this.appCreateCommand(program, function(err) {
      if (err) return done(err);

      var appDir = path.join(self.tmp, self.appName);
      assert.ok(fs.existsSync(appDir));
      assert.ok(fs.existsSync(appDir + '/package.json'));
      assert.ok(fs.existsSync(appDir + '/node_modules/dependency'));


      done();
    });
  });
});