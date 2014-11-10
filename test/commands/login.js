var mocha = require('mocha'),
  ReadlineStub = require("../helpers/readline"),
  loginCommand = require('../../commands/login'),
  util = require('util'),
  inquirer = require('inquirer');

require('../before');

var Input = inquirer.prompts.input;

describe('login command', function() {
  beforeEach(function() {
    // this._write = Input.prototype.write;
    // Input.prototype.write = function( str ) {
    //   self.output += str;
    //   return this;
    // };

    inquirer.prompt.restoreDefaultPrompts();

    this.readline = new ReadlineStub();
    var self = this;
    // inquirer.prompt.rl = this.readline;
    var Input = inquirer.prompt.prompts.input;

    var _Input = function(opts) {
      debugger;
      // arguments.push(this.readline);
      return new Input(opts, this.readline);
    }
    util.inherits(_Input, Input);

    this.Input = _Input;

    inquirer.prompt.registerPrompt('input', _Input);

    //  function(opts) {
    //   console.log("Custom input constructor");
    //   debugger;
    //   return new _input(opts);
    // });

    this.program = {};
  });

  afterEach(function() {
    // inquirer.registerPrompt('input', _input);
    // Input.prototype.write = this._write;
  });

  it('should validate userId input', function(done){  
    var input = new this.Input({message: 'message', name: 'name'});

    input.run(function( answer ) {
      expect(answer).to.equal("Inquirer");
      done();
    });

    this.rl.emit( "line", "Inquirer" );

    // debugger;
    // loginCommand(this.program, function() {

    //   done();
    // });

    this.readline.emit("line", "xxx");
  });
});