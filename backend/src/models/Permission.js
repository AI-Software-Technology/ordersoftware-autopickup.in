const { defineModel, str, reqStr } = require('./defineModel');

module.exports = defineModel('Permission', 'permissions', {
  module: reqStr(),
  action: reqStr(),
  code: { type: String, required: true, unique: true },
  description: str(),
});
