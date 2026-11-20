const { defineModel, str, num, reqStr, reqNum, createdAt } = require('./defineModel');

// Party credit ledger: every rupee added to / used from Vendor.credit_balance
module.exports = defineModel('CreditLedger', 'credit_ledger', {
  vendor_id: reqNum(),
  order_id: num(),
  payment_id: num(),
  // CREDIT = excess cash saved for the party, DEBIT = adjusted against an order
  type: reqStr(),
  amount: reqNum(),
  balance_after: reqNum(),
  note: str(),
  created_by_id: num(),
  created_at: createdAt(),
}, [{ vendor_id: 1 }]);
