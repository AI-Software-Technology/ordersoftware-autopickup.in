// Party credit: excess cash saved per party, adjusted against orders ( only when the user chooses to )
const { Order, Vendor, Payment, CreditLedger, User } = require('../models');
const { logActivity, addHistory } = require('../utils/audit');
const { toId, nowStr, round2, inr, uniq } = require('../utils/helpers');
const { moveCredit } = require('../utils/credit');
const { recalcOrderLedger } = require('./payment.controller');

// Moves credit into an order as an auto-verified "Party Credit" payment.
// amount = max rupees to use ( omitted = as much as possible ). Returns { applied, ... } or { error }.
async function applyCreditToOrder(order, user, amount) {
  if (order.order_status === 'CANCELLED') return { error: 'Cannot adjust credit on a cancelled order' };
  const vendor = await Vendor.row({ id: order.vendor_id }, { select: 'id company_name credit_balance' });
  const balance = round2(vendor?.credit_balance || 0);
  const pending = round2(Math.max(0, order.grand_total - (order.amount_received || 0)));
  if (balance <= 0) return { error: 'This party has no credit balance' };
  if (pending <= 0) return { error: 'This order has no pending amount' };

  const wanted = amount === undefined || amount === null || amount === '' ? Infinity : Number(amount);
  if (isNaN(wanted) || wanted <= 0) return { error: 'Credit amount must be greater than 0' };
  const applied = round2(Math.min(wanted, balance, pending));

  const id = await Payment.nextId();
  const payNumber = `PAY-${10000 + id}`;
  await Payment.insert({
    id,
    payment_number: payNumber,
    order_id: order.id,
    amount: applied,
    payment_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'Party Credit',
    reference_number: `CREDIT-${payNumber}`,
    notes: `Adjusted from party credit (${vendor.company_name})`,
    is_verified: 1,
    status: 'VERIFIED',
    received_by_id: user.id,
    verified_by_id: user.id,
    verified_at: nowStr(),
  });
  await moveCredit({
    vendorId: order.vendor_id, type: 'DEBIT', amount: applied, orderId: order.id, paymentId: id, userId: user.id,
    note: `Adjusted against ${order.order_number}`,
  });
  const fresh = await Order.row({ id: order.id });
  const ledger = await recalcOrderLedger(fresh, { userId: user.id });

  await addHistory(order.id, 'Party Credit Adjusted', order.payment_status, ledger.status,
    `₹${inr(applied)} adjusted from party credit by ${user.name} (${payNumber}).`, user.id);
  await logActivity(user.id, 'CREDIT_ADJUSTED', 'order', order.order_number,
    `${user.name} adjusted ₹${inr(applied)} party credit against ${order.order_number}`);

  const after = await Vendor.row({ id: order.vendor_id }, { select: 'credit_balance' });
  return {
    applied, payment_number: payNumber, credit_balance: round2(after?.credit_balance || 0),
    amount_received: ledger.received, pending_amount: ledger.pending, payment_status: ledger.status,
  };
}
exports.applyCreditToOrder = applyCreditToOrder;

const canUse = (user) => ['super_admin', 'admin', 'accounts', 'sales_person'].includes(user.role_slug);

// POST /api/orders/:id/adjust-credit   { amount? }
exports.adjustForOrder = async (req, res) => {
  const user = req.user;
  if (!canUse(user)) return res.status(403).json({ error: 'Forbidden: You cannot adjust party credit' });
  const id = toId(req.params.id);
  const order = id === null ? null : await Order.row({ id });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (user.role_slug === 'sales_person' && order.sales_person_id !== user.id) {
    return res.status(403).json({ error: "You cannot adjust credit on another Sales Person's order" });
  }
  const r = await applyCreditToOrder(order, user, req.body?.amount);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ success: true, message: `₹${inr(r.applied)} adjusted from party credit.`, ...r });
};

// GET /api/vendors/:id/credit
exports.vendorCredit = async (req, res) => {
  const user = req.user;
  const id = toId(req.params.id);
  const vendor = id === null ? null : await Vendor.row({ id });
  if (!vendor) return res.status(404).json({ error: 'Party not found' });
  if (user.role_slug === 'sales_person' && vendor.assigned_sales_person_id !== user.id) {
    return res.status(403).json({ error: 'Access denied: You can only view your own parties' });
  }
  const rows = await CreditLedger.rows({ vendor_id: id }, { sort: { id: -1 }, limit: 200 });
  const orders = await Order.byIds(uniq(rows.map((r) => r.order_id)), 'id order_number');
  const users = await User.byIds(uniq(rows.map((r) => r.created_by_id)), 'id name');
  res.json({
    vendor_id: id,
    credit_balance: round2(vendor.credit_balance || 0),
    ledger: rows.map((r) => ({
      ...r,
      order_number: orders.get(r.order_id)?.order_number ?? null,
      created_by_name: users.get(r.created_by_id)?.name ?? null,
    })),
  });
};
