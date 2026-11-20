const { defineModel, str, reqStr, reqNum, createdAt } = require('./defineModel');

module.exports = defineModel('User', 'users', {
  name: reqStr(),
  email: { type: String, required: true, unique: true, trim: true },
  password_hash: reqStr(),
  role_id: reqNum(),
  mobile: str(),
  employee_id: str(),
  avatar_url: str(),
  status: str('active'),
  created_at: createdAt(),
}, [{ role_id: 1 }]);
