const { defineModel, str, reqStr, reqNum, createdAt } = require('./defineModel');

module.exports = defineModel('OrderStatusHistory', 'order_status_history', {
  order_id: reqNum(),
  stage_name: reqStr(),
  previous_status: str(),
  new_status: reqStr(),
  notes: str(),
  created_by_id: reqNum(),
  created_at: createdAt(),
}, [{ order_id: 1 }]);
