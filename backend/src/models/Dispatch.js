const { defineModel, str, reqStr, reqNum, createdAt } = require('./defineModel');

module.exports = defineModel('Dispatch', 'dispatches', {
  dispatch_number: { type: String, required: true, unique: true },
  order_id: reqNum(),
  dispatch_date: reqStr(),
  transport_name: reqStr(),
  transport_contact: str(),
  vehicle_number: reqStr(),
  lr_number: str(),
  tracking_number: str(),
  driver_name: str(),
  driver_mobile: str(),
  dispatch_quantity: reqNum(),
  notes: str(),
  // line items dispatched in this consignment
  items: { type: [{ _id: false, order_item_id: Number, quantity: Number }], default: [] },
  created_by_id: reqNum(),
  created_at: createdAt(),
}, [{ order_id: 1 }]);
