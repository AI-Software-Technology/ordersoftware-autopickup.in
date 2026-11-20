const { defineModel, str, num, reqStr, createdAt } = require('./defineModel');

module.exports = defineModel('Notification', 'notifications', {
  user_id: num(),
  role_slug: str(),
  title: reqStr(),
  message: reqStr(),
  type: { type: String, default: 'info' },
  order_id: num(),
  is_read: num(0),
  created_at: createdAt(),
}, [{ user_id: 1 }, { role_slug: 1 }]);
