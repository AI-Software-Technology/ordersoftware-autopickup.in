const { defineModel, str, reqStr, reqNum, createdAt } = require('./defineModel');

module.exports = defineModel('ProductionRecord', 'production_records', {
  order_id: reqNum(),
  order_item_id: reqNum(),
  batch_number: reqStr(),
  produced_quantity: reqNum(),
  production_date: reqStr(),
  operator_name: str(),
  notes: str(),
  created_by_id: reqNum(),
  created_at: createdAt(),
}, [{ order_id: 1 }]);
