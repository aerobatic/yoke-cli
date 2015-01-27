var mocha = require('mocha');
var assert = require('assert');
var helper = require('../lib/helper');

require('./helpers/assert');

describe('helper', function() {
  it('parseGithubRepo', function() {
    var repo = helper.parseGithubRepo('https://github.com/the_owner/the-repo');
    assert.isEqual(repo, 'the_owner/the-repo');

    var repo = helper.parseGithubRepo('git@github.com:the_owner/the-repo.git');
    assert.isEqual(repo, 'the_owner/the-repo');

    var repo = helper.parseGithubRepo('the_owner/the-repo.git');
    assert.isEqual(repo, 'the_owner/the-repo');    

    var repo = helper.parseGithubRepo('https://somewhere.com/invalid_git_repo');
    assert.isFalse(repo);
  });
});