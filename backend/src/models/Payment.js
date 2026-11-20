const { defineModel, str, num, reqStr, reqNum, createdAt } = require('./defineModel');

module.exports = defineModel('Payment', 'payments', {
  payment_number: { type: String, required: true, unique: true },
  order_id: reqNum(),
  amount: reqNum(),
  payment_date: reqStr(),
  payment_mode: reqStr(),
  reference_number: str(),
  proof_url: str(),
  notes: str(),
  // 0 = pending verification, 1 = verified, -1 = rejected
  is_verified: num(0),
  status: str('PENDING_VERIFICATION'),
  rejection_reason: str(),
  received_by_id: reqNum(),
  verified_by_id: num(),
  verified_at: str(),
  created_at: createdAt(),
  updated_by_id: num(),
  updated_at: str(),
}, [{ order_id: 1 }, { payment_date: 1 }]);
