var assert = require("assert"),
  _ = require('lodash');

assert.isUUID = function(val) {
  if (!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(val))
    throw new assert.AssertionError({message: val + " is not a valid UUID"});
}

assert.isTrue = function(val) {
  assert.equal(val, true);
};

assert.isFalse = function(val) {
  assert.equal(val, false);
};

assert.isNumber = function(val) {
  if (_.isNumber(val) === false)
    throw new assert.AssertionError({message: val + " is not a number"});
};

assert.isObject = function(val) {
  if (_.isObject(val) === false)
    throw new assert.AssertionError({message: val + " is not a number"});
};

assert.isDefined = function(val) {
  if (_.isUndefined(val) === true)
    throw new assert.AssertionError({message: "Expected value to be defined"});
};

assert.isUndefined = function(val) {
  if (_.isUndefined(val) !== true)
    throw new assert.AssertionError({message: "Expected value to be undefined"});
};

assert.isNotNull = function(val) {
  if (val == null)
    throw new assert.AssertionError({message: "value is null"});
};

assert.isNull = function(val) {
  if (val !== null)
    throw new assert.AssertionError({message: "value is not null"});
};

assert.match = function(val, regex) {
  if (regex.test(val) !== true)
    throw new assert.AssertionError({message: val + " does not match regex " + regex.toString()});
};

assert.any = function(val, test) {
  if (_.any(val, test) !== true)
    throw new assert.AssertionError({message: "No matching value in the collection"});
};

assert.all = function(val, test) {
  if (_.all(val, test) !== true)
    throw new assert.AssertionError({message: "Not all the values in the collection pass the test"});
};

assert.propertiesEqual = function(obj1, obj2, properties) {
  if (_.isString(properties))
    properties = properties.split(',');

  for (var i=0; i<properties.length; i++) {
    var prop = properties[i];
    if (!_.has(obj1, prop) || !_.has(obj2, prop))
      throw new assert.AssertionError({message: "Both objects do not have the property " + prop + " defined."});

    if (_.isEqual(obj1[prop], obj2[prop]) === false)
      throw new assert.AssertionError({message: "Value of property " + prop + " is not equal on both objects."});
  }
};

assert.isJson = function(val) {
  var valid = false;
  if (_.isString(val)) {
    try {
      JSON.parse(val);
      valid = true;
    }
    catch (e) {
      valid = false;
      winston.debug("Not valid JSON");
    }
  }
  if (valid !== true)
    throw new assert.AssertionError({message: "Not valid json"});
};
