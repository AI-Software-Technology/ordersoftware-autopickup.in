const { defineModel, str, num, reqStr, reqNum, createdAt } = require('./defineModel');

module.exports = defineModel('Delivery', 'deliveries', {
  order_id: reqNum(),
  dispatch_id: num(),
  delivery_date: reqStr(),
  delivered_quantity: reqNum(),
  received_by: reqStr(),
  receiver_mobile: str(),
  pod_url: str(),
  notes: str(),
  // Shipment invoice ( one invoice per delivery / partial delivery )
  shipment_no: num(1),
  invoice_number: str(),
  is_partial: num(0),
  tax_type: str('GST_18'),
  subtotal: num(0),
  tax_amount: num(0),
  invoice_total: num(0),
  items: { type: [{ _id: false, order_item_id: Number, quantity: Number }], default: [] },
  created_by_id: reqNum(),
  created_at: createdAt(),
}, [{ order_id: 1 }]);
