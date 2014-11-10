var mockery = require("mockery");
var ReadlineStub = require("./helpers/readline");

mockery.enable();
mockery.warnOnUnregistered(true);
mockery.registerMock("readline2", {
  createInterface: function() {
    console.log("Using ReadlineStub");
    return new ReadlineStub();
  }
});