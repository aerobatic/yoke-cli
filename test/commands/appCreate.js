var mocha = require('mocha');
var util = require('util');
var assert = require('assert');
var path = require('path');
var express = require('express');
var zlib = require('zlib');
var fs = require('fs');
var tarStream = require('tar-stream');
var sinon = require('sinon');
var rimraf = require('rimraf');
var bodyParser = require('body-parser');
var log = require('../../lib/log');
var appCreate = require('../../commands/appCreate');  
var shortid = require('shortid');

describe('create app', function() {
  before(function(done) {
    process.env.YOKE_DEBUG = '1';
    this.tmp = path.join(__dirname, '../../tmp');
    process.stdout.write('\n');

    this.templates = [
      {
        "title": "test template",
        "buildTools": ["grunt"],
        "gitHubRepo": "aerobatic/test-template"
      }
    ];

    var self = this;
    // Create an express server to simulate npm, GitHub, and bower
    var expressMock = express();
    expressMock.use(bodyParser.json());

    expressMock.get('/metadata/templates.json', function(req, res) {
      res.send(JSON.stringify({templates: self.templates}));
    });

    var starterTemplateUrl = util.format('/github/%s/archive/%s-yoke.tar.gz',
      this.templates[0].gitHubRepo,
      this.templates[0].buildTools[0]);

    expressMock.get(starterTemplateUrl, function(req, res) {
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

      if (self.includePackageJsonInTemplate !== false)
        pack.entry({ name: 'archive/package.json' }, JSON.stringify(packageJson));

      // TODO: Write a bower.json file

      pack.entry({name: 'archive/index.html'}, "<html></html>");
      pack.finalize();

      res.set('Content-Type', 'application/x-gzip');
      pack.pipe(zlib.createGzip()).pipe(res);
    });

    expressMock.get('/npm/dependency.tar.gz', function(req, res) {
      var pack = tarStream.pack();

      var packageJson = {name: 'dependency', version:'0.0.1', description:'sample module', repository:{}};
      pack.entry({name: 'dependency/package.json'}, JSON.stringify(packageJson));
      pack.entry({name: 'dependency/index.js'}, "module.exports={}");
      pack.entry({name: 'depencency/README.md'}, "##README");
      pack.finalize();

      res.set('Content-Type', 'application/x-gzip');
      pack.pipe(zlib.createGzip()).pipe(res);
    });

    this.createdAppId = shortid.generate();
    expressMock.post('/api/apps', function(req, res) {
      res.json({
        appId: self.createdAppId,
        name: req.body.name
      });
    });

    this.mockServer = expressMock.listen(9999, function() {
      log.info("Mock server listening on port 9999");
      done();
    });
  });

  after(function() {
    if (this.mockServer)
      this.mockServer.close();
  });

  beforeEach(function() {
    var self = this;
    self.includePackageJsonInTemplate = true;

    rimraf.sync(this.tmp);
    fs.mkdirSync(this.tmp);

    this.appName = 'test-app';

    this.program = {
      templatesUrl: 'http://localhost:9999/metadata/templates.json',
      gitHubUrl: 'http://localhost:9999/github',
      apiUrl: "http://localhost:9999",
      inquirer: {
        prompt: sinon.spy(function(questions, callback) {
          callback({
            appName: self.appName,
            startingMode: 'scratch',
            template: self.templates[0],
            buildTool: 'grunt'
          });
        })
      },
      baseDir: self.tmp
    };
  });

  it('creates app', function(done) {
    this.timeout(2000);

    var program = {};
    var self = this;
    appCreate(this.program, function(err, app) {
      if (err) return done(err);

      var appDir = path.join(self.tmp, self.appName);
      assert.ok(fs.existsSync(appDir));
      assert.ok(fs.existsSync(appDir + '/package.json'));
      assert.ok(fs.existsSync(appDir + '/node_modules/dependency'));
      assert.equal(app.appId, self.createdAppId);

      done();
    });
  });

  it('updates package.json file', function(done) {
    var program = {};
    var self = this;
    appCreate(this.program, function(err, app) {
      if (err) return done(err);

      var packageJsonPath = path.join(self.tmp, self.appName, 'package.json');
      assert.ok(fs.existsSync(packageJsonPath));


      var packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
      assert.equal(packageJson._aerobatic.appId, app.appId);
      done();
    });
  });

  it('creates new package.json if no template used', function(done) {
    this.program.inquirer.prompt = function(questions, callback) {
      callback({
        appName: self.appName,
        startingMode: 'scratch',
        template: null
      });
    };

    var program = {};
    var self = this;
    appCreate(this.program, function(err, app) {
      if (err) return done(err);

      var packageJsonPath = path.join(self.tmp, self.appName, 'package.json');
      assert.ok(fs.existsSync(packageJsonPath));

      var packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
      assert.equal(packageJson._aerobatic.appId, app.appId);
      done();
    });
  });
});