const { defineModel, str, createdAt } = require('./defineModel');

module.exports = defineModel('Brand', 'brands', {
  name: { type: String, required: true, unique: true },
  description: str(''),
  status: str('active'),
  created_at: createdAt(),
});
