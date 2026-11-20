const { defineModel, str, num, reqStr, reqNum } = require('./defineModel');

module.exports = defineModel('OrderItem', 'order_items', {
  order_id: reqNum(),
  product_id: reqNum(),
  sku: reqStr(),
  product_name: reqStr(),
  unit: reqStr(),
  quantity: reqNum(),
  produced_quantity: num(0),
  dispatched_quantity: num(0),
  delivered_quantity: num(0),
  rate: reqNum(),
  line_amount: reqNum(),
  notes: str(),
  item_colour: str(''),
  item_availability: str('AVAILABLE'),
}, [{ order_id: 1 }, { product_id: 1 }]);
