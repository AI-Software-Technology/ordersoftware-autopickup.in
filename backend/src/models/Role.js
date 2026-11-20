const { defineModel, str, num, reqStr, createdAt } = require('./defineModel');

module.exports = defineModel('Role', 'roles', {
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: str(),
  is_system: num(0),
  // ids of permissions granted to this role
  permission_ids: { type: [Number], default: [] },
  created_at: createdAt(),
});
