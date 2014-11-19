var mocha = require('mocha');
var assert = require('assert');
var rimraf = require('rimraf');
var request = require('request');
var fs = require('fs');
var touch = require("touch");
var path = require('path');
var express = require('express');
var shortid = require('shortid');
var supertest = require('supertest');
var log = require('../../lib/log');
var serve = require('../../commands/serve');

require('../helpers/assert');

describe('serve command', function() {
  before(function(done) {
    process.env.YOKE_DEBUG = '1';

    // Create a mock API server
    var mockServer = express();

    mockServer.get('/api/apps/:appId', function(req, res) {
      res.json({
        appId: req.params.appId
      });
    });

    mockServer.listen(9999, function() {
      log.info("Mock server listening on port 9999");
      done();
    });
  });

  beforeEach(function() {
    this.tmp = path.join(__dirname, '../../tmp');

    // Delete and re-create the tmp directory
    rimraf.sync(this.tmp);
    fs.mkdirSync(this.tmp);

    this.program = {
      cwd: this.tmp,
      appId: shortid.generate(),
      apiUrl: "http://localhost:9999",
      port: 4000
    };
  });

  it('returns error when no index page exists', function(done) {
    serve(this.program, function(err) {
      assert.isNotNull(err);
      assert.isTrue(/Could not find any of the following/.test(err.message));
      done();
    }); 
  });

  it('uses src directory as baseDir if it exists', function(done) {
    var self = this;
    fs.mkdirSync(path.join(this.program.cwd, 'src'));
    fs.writeFileSync(path.join(this.program.cwd, 'src', 'index.html'), '<html><head></head><body></body></html>');

    serve(this.program, function(err, end) {
      if (err) return done(err);

      assert.equal(self.program.baseDir, path.join(self.tmp, 'src'));

      end();
      done();
    });
  });

  it('returns error if specified baseDir does not exist', function(done) {
    var self = this;

    this.program.baseDirs = {
      debug: 'missing'
    };

    serve(this.program, function(err) {
      assert.isDefined(err);
      assert.isTrue(/specified in package.json does not exist/.test(err.message));
      done();
    });
  });

  it('returns error if no index page found', function(done) {
    serve(this.program, function(err) {
      assert.isDefined(err);
      assert.isTrue(/Could not find any of the following pages/.test(err.message));
      done();
    });
  });

  it('returns error for invalid build type', function(done) {
    this.program.build = 'invalid';
    serve(this.program, function(err) {
      assert.isDefined(err);
      assert.isTrue(/Invalid build option value/.test(err.message));
      done();
    });
  });

  it('detects changes to index page', function(done) {
    var self = this;
    var indexPage = path.join(this.tmp, 'index.html');
    fs.writeFileSync(indexPage, '<html><head></head><body></body></html>');

    serve(this.program, function(err, end) {
      if (err) return done(err);

      // Make a request to the index page to load up all the pages to watch
      request('http://localhost:' + self.program.port, function(err, resp, body) {
        if (err) return done(err);

        assert.isTrue(/\<html\>/.test(body));
        // touch.sync(path.join(self.tmp, 'index.html'), {force: true});
        fs.writeFileSync(indexPage, '<html><head></head><body>FOO</body></html>');
        setTimeout(function() {
          assert.deepEqual(self.program.lastFileChanges, [indexPage]);

          end();
          done();
        }, 300);  
      });
    });
  });

  it('detects changes to javascript', function(done) {
    var self = this;
    fs.writeFileSync(path.join(this.tmp, 'index.html'), '<html />');

    var scriptFile = path.join(this.tmp, 'script.js');
    fs.writeFileSync(scriptFile, 'function(){}');

    serve(this.program, function(err, end) {
      if (err) return done(err);

      // Make a request to the index page to load up all the pages to watch
      request('http://localhost:' + self.program.port + '/script.js', function(err, resp, body) {
        if (err) return done(err);

        assert.isTrue(/function\(\)/.test(body));        
        fs.writeFileSync(scriptFile, 'function(){console.log("boo");}');
        setTimeout(function() {
          assert.deepEqual(self.program.lastFileChanges, [scriptFile]);

          end();
          done();
        }, 300);  
      });
    });
  });
});