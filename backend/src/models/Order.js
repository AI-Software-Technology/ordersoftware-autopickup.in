const { defineModel, str, num, reqNum, createdAt } = require('./defineModel');

module.exports = defineModel('Order', 'orders', {
  order_number: { type: String, required: true, unique: true },
  company_id: reqNum(),
  vendor_id: reqNum(),
  sales_person_id: reqNum(),
  transportName: str(),


  transportName: str(),
  transportAddress: str(),
  booking_station: str(),
  transport_contact_number: str(),

  order_status: str('NEW'),
  production_status: str('NOT_ASSIGNED'),
  packing_status: str('PENDING_PACKING'),
  packing_notes: str(),
  dispatch_status: str('NOT_DISPATCHED'),
  delivery_status: str('PENDING'),
  payment_status: str('UNPAID'),
  payment_terms: str('Advance'),

  tax_type: str('GST_18'),
  subtotal: num(0),
  // Discount on gross (GST-inclusive) item total. type: NONE | PERCENT | FLAT
  gross_amount: num(0),
  discount_type: str('NONE'),
  discount_value: num(0),
  discount_amount: num(0),
  tax_rate: num(18),
  tax_amount: num(0),
  grand_total: num(0),
  amount_received: num(0),
  pending_amount: num(0),
  // Cash received above grand_total (already moved to the party's credit balance)
  excess_amount: num(0),

  required_delivery_date: str(),
  delivery_address: str(),
  delivery_contact_person: str(),
  delivery_contact_number: str(),
  special_instructions: str(),
  notes: str(),

  cancellation_reason: str(),
  cancelled_by_id: num(),
  cancelled_at: str(),
  assigned_to_production_at: str(),
  production_completed_at: str(),
  dispatched_at: str(),
  delivered_at: str(),
  delivered_by_id: num(),
  delivered_by_name: str(),
  completed_at: str(),
  completed_by_id: num(),

  created_by_id: reqNum(),
  created_at: createdAt(),
  updated_by_id: num(),
  updated_at: createdAt(),
}, [{ sales_person_id: 1 }, { vendor_id: 1 }, { order_status: 1 }, { created_at: 1 }]);