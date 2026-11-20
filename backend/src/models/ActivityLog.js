const { defineModel, str, num, reqStr, createdAt } = require('./defineModel');

module.exports = defineModel('ActivityLog', 'activity_logs', {
  user_id: num(),
  action: reqStr(),
  entity_type: reqStr(),
  entity_id: str(),
  description: reqStr(),
  created_at: createdAt(),
}, [{ entity_id: 1 }]);
