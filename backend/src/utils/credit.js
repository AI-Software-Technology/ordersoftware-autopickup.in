// Party credit helpers ( excess cash saved against a party, adjusted on later orders )
const { Vendor, CreditLedger } = require('../models');
const { round2 } = require('./helpers');

// Atomically moves the party's credit balance and writes a ledger line
async function moveCredit({ vendorId, type, amount, orderId = null, paymentId = null, note = null, userId = null }) {
  const amt = round2(amount);
  if (!(amt > 0)) return null;
  const sign = type === 'CREDIT' ? 1 : -1;
  await Vendor.updateOne({ id: vendorId, credit_balance: null }, { $set: { credit_balance: 0 } }); // legacy rows
  const v = await Vendor.findOneAndUpdate({ id: vendorId }, { $inc: { credit_balance: sign * amt } }, { new: true }).lean();
  if (!v) return null;
  await CreditLedger.insert({
    vendor_id: vendorId, order_id: orderId, payment_id: paymentId, type, amount: amt,
    balance_after: round2(v.credit_balance), note, created_by_id: userId,
  });
  return round2(v.credit_balance);
}

// Keeps Vendor.credit_balance in step with (verified received - order total) of ONE order.
// Called whenever the order's verified payments change ( verify / edit ).
async function syncOrderExcess(order, received, userId = null) {
  const excess = round2(Math.max(0, received - order.grand_total));
  const prev = round2(order.excess_amount || 0);
  const delta = round2(excess - prev);
  if (delta > 0) {
    await moveCredit({
      vendorId: order.vendor_id, type: 'CREDIT', amount: delta, orderId: order.id, userId,
      note: `Extra payment received on ${order.order_number} saved as party credit`,
    });
  } else if (delta < 0) {
    const v = await Vendor.row({ id: order.vendor_id }, { select: 'credit_balance' });
    const take = Math.min(-delta, Math.max(0, v?.credit_balance || 0));
    await moveCredit({
      vendorId: order.vendor_id, type: 'DEBIT', amount: take, orderId: order.id, userId,
      note: `Payment on ${order.order_number} edited - excess reduced`,
    });
  }
  return excess;
}

module.exports = { moveCredit, syncOrderExcess };
