// Payments: submit -> accounts verification -> ledger update
const { Order, Payment, Vendor, User, Company, Role } = require('../models');
const { logActivity, sendNotification, addHistory } = require('../utils/audit');
const { toId, like, nowStr, round2, addDateRange, sumBy, uniq, inr } = require('../utils/helpers');
const { resolveIdsByIdOrName, idsMatching, isActive } = require('../utils/queries');
const { syncOrderExcess } = require('../utils/credit');
const { resolveFileInput, deleteUploaded } = require('../utils/uploads');

const isVerified = (p) => p.is_verified === 1 || p.status === 'VERIFIED';

const findOrderByIdOrNumber = (value) => {
  const id = toId(value);
  return Order.row({ $or: [...(id !== null ? [{ id }] : []), { order_number: String(value) }] });
};

// Sum of verified payments of an order -> updates order ledger fields
async function recalcOrderLedger(order, { rounded = false, userId = null } = {}) {
  const verified = await Payment.rows({ order_id: order.id, is_verified: 1 }, { select: 'amount' });
  let received = sumBy(verified, (p) => p.amount);
  let pending = Math.max(0, order.grand_total - received);
  if (rounded) {
    received = round2(received);
    pending = Math.max(0, round2(order.grand_total - received));
  }

  let status = 'UNPAID';
  if (received >= order.grand_total && (!rounded || order.grand_total > 0)) status = 'FULLY_PAID';
  else if (received > 0) status = 'PARTIALLY_PAID';

  // Anything received above the order total is saved as the party's credit
  const excess = await syncOrderExcess(order, received, userId);

  await Order.updateOne(
    { id: order.id },
    { $set: { amount_received: received, pending_amount: pending, payment_status: status, excess_amount: excess, updated_at: nowStr() } }
  );
  return { received, pending, status, excess };
}

// Adds order / party / user display fields to payment rows
async function decoratePayments(payments, { withOrderSalesPersonAlias = false, withUpdatedBy = true } = {}) {
  const orders = await Order.byIds(uniq(payments.map((p) => p.order_id)));
  const orderList = [...orders.values()];
  const [vendors, companies, users] = await Promise.all([
    Vendor.byIds(uniq(orderList.map((o) => o.vendor_id)), 'id company_name'),
    Company.byIds(uniq(orderList.map((o) => o.company_id)), 'id name'),
    User.byIds(
      uniq([
        ...orderList.map((o) => o.sales_person_id),
        ...payments.flatMap((p) => [p.received_by_id, p.verified_by_id, p.updated_by_id]),
      ]),
      'id name'
    ),
  ]);

  return payments
    .filter((p) => orders.has(p.order_id))
    .map((p) => {
      const o = orders.get(p.order_id);
      return {
        ...p,
        order_number: o.order_number,
        grand_total: o.grand_total,
        total_order_amount: o.grand_total,
        order_total_received: o.amount_received,
        pending_amount: o.pending_amount,
        order_pending: o.pending_amount,
        order_payment_status: o.payment_status,
        ...(withOrderSalesPersonAlias ? { order_sales_person_id: o.sales_person_id } : { sales_person_id: o.sales_person_id }),
        vendor_name: vendors.get(o.vendor_id)?.company_name ?? null,
        billing_company_name: companies.get(o.company_id)?.name ?? null,
        sales_person_name: users.get(o.sales_person_id)?.name ?? null,
        received_by_name: users.get(p.received_by_id)?.name ?? null,
        submitted_by_name: users.get(p.received_by_id)?.name ?? null,
        verified_by_name: users.get(p.verified_by_id)?.name ?? null,
        ...(withUpdatedBy ? { updated_by_name: users.get(p.updated_by_id)?.name ?? null } : {}),
      };
    });
}

// GET /api/payments/eligible-orders  ( orders with pending balance )
exports.eligibleOrders = async (req, res) => {
  const user = req.user;
  const filter = { order_status: { $ne: 'CANCELLED' }, pending_amount: { $gt: 0.01 } };
  if (user.role_slug === 'sales_person') filter.sales_person_id = user.id;

  const rows = await Order.rows(filter, {
    select: 'id order_number grand_total amount_received pending_amount payment_status order_status sales_person_id vendor_id company_id',
    sort: { id: -1 },
  });
  const [vendors, companies, users] = await Promise.all([
    Vendor.byIds(uniq(rows.map((o) => o.vendor_id)), 'id company_name'),
    Company.byIds(uniq(rows.map((o) => o.company_id)), 'id name'),
    User.byIds(uniq(rows.map((o) => o.sales_person_id)), 'id name'),
  ]);

  const orders = rows.map(({ vendor_id, company_id, ...o }) => ({
    ...o,
    vendor_name: vendors.get(vendor_id)?.company_name ?? null,
    billing_company_name: companies.get(company_id)?.name ?? null,
    sales_person_name: users.get(o.sales_person_id)?.name ?? null,
  }));
  res.json({ orders });
};

// GET /api/payments  ( ledger with filters + summary )
exports.list = async (req, res) => {
  const user = req.user;
  const canView =
    ['super_admin', 'admin', 'accounts', 'sales_person'].includes(user.role_slug) ||
    ['payments:view', 'payments:add', 'payments:view_own', 'payments:view_all'].some((p) => user.permissions.includes(p));
  if (!canView) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access Payments & Ledger' });
  }

  const { search, status, payment_mode, date_type, startDate, endDate, date_from, date_to, sales_person_id, vendor_id, order_id } = req.query;
  const sDate = startDate || date_from;
  const eDate = endDate || date_to;
  const isSalesPerson = user.role_slug === 'sales_person';

  // ---- order scope ( ownership / sales person / party ) ----
  const orderScope = {};
  if (isSalesPerson) orderScope.sales_person_id = user.id;
  else if (isActive(sales_person_id)) orderScope.sales_person_id = { $in: await resolveIdsByIdOrName(User, 'name', sales_person_id) };
  if (isActive(vendor_id)) orderScope.vendor_id = { $in: await resolveIdsByIdOrName(Vendor, 'company_name', vendor_id) };

  const and = [];
  if (Object.keys(orderScope).length) {
    const scoped = await Order.rows(orderScope, { select: 'id' });
    and.push({ order_id: { $in: scoped.map((o) => o.id) } });
  }

  if (order_id) {
    const oid = toId(order_id);
    const matches = await Order.rows(
      { $or: [{ order_number: like(order_id) }, ...(oid !== null ? [{ id: oid }] : [])] },
      { select: 'id' }
    );
    and.push({ order_id: { $in: matches.map((o) => o.id) } });
  }

  if (search) {
    const rx = like(search);
    const vendorIds = await idsMatching(Vendor, ['company_name'], search);
    const matches = await Order.rows({ $or: [{ order_number: rx }, { vendor_id: { $in: vendorIds } }] }, { select: 'id' });
    and.push({
      $or: [{ payment_number: rx }, { reference_number: rx }, { order_id: { $in: matches.map((o) => o.id) } }],
    });
  }

  if (status === 'VERIFIED') {
    and.push({ $or: [{ is_verified: 1 }, { status: 'VERIFIED' }] });
  } else if (status === 'PENDING' || status === 'PENDING_VERIFICATION') {
    and.push({ is_verified: 0, status: { $in: [null, 'PENDING_VERIFICATION'] } });
  } else if (status === 'REJECTED') {
    and.push({ $or: [{ is_verified: -1 }, { status: 'REJECTED' }] });
  }

  if (isActive(payment_mode)) and.push({ payment_mode: String(payment_mode) });

  // Date filter: payment date ( default ) / submitted date / verification date
  if (sDate || eDate) {
    const dt = date_type || 'payment_date';
    if (dt === 'submitted_date') and.push(addDateRange({}, 'created_at', sDate, eDate));
    else if (dt === 'verification_date') and.push(addDateRange({}, 'verified_at', sDate, eDate));
    else {
      const cond = {};
      if (sDate) cond.$gte = String(sDate);
      if (eDate) cond.$lte = String(eDate);
      and.push({ payment_date: cond });
    }
  }

  const rows = await Payment.rows(and.length ? { $and: and } : {}, { sort: { id: -1 } });
  const payments = await decoratePayments(rows, { withOrderSalesPersonAlias: true });

  const total = (list) => list.reduce((acc, p) => acc + (p.amount || 0), 0);
  const verifiedList = payments.filter(isVerified);
  const pendingList = payments.filter((p) => p.is_verified === 0 && p.status !== 'REJECTED');
  const rejectedList = payments.filter((p) => p.is_verified === -1 || p.status === 'REJECTED');

  // In-scope order book totals
  const bookFilter = addDateRange({ ...orderScope, order_status: { $ne: 'CANCELLED' } }, 'created_at', sDate, eDate);
  const book = await Order.rows(bookFilter, { select: 'grand_total amount_received pending_amount' });

  // Filter dropdowns ( a Sales Person never sees other reps )
  let salesPersons;
  let vendors;
  if (isSalesPerson) {
    salesPersons = [{ id: user.id, name: user.name }];
    const own = await Order.rows({ sales_person_id: user.id }, { select: 'vendor_id' });
    vendors = await Vendor.rows(
      { $or: [{ assigned_sales_person_id: user.id }, { id: { $in: uniq(own.map((o) => o.vendor_id)) } }] },
      { select: 'id company_name', sort: { company_name: 1 } }
    );
  } else {
    const [salesRole, allOrders] = await Promise.all([
      Role.row({ slug: 'sales_person' }),
      Order.rows({}, { select: 'sales_person_id vendor_id' }),
    ]);
    [salesPersons, vendors] = await Promise.all([
      User.rows(
        { $or: [{ role_id: salesRole ? salesRole.id : -1 }, { id: { $in: uniq(allOrders.map((o) => o.sales_person_id)) } }] },
        { select: 'id name', sort: { name: 1 } }
      ),
      Vendor.rows(
        { $or: [{ status: 'active' }, { id: { $in: uniq(allOrders.map((o) => o.vendor_id)) } }] },
        { select: 'id company_name', sort: { company_name: 1 } }
      ),
    ]);
  }

  res.json({
    payments,
    summary: {
      totalOrderValue: sumBy(book, (o) => o.grand_total),
      verifiedReceived: sumBy(book, (o) => o.amount_received),
      pendingBalance: sumBy(book, (o) => o.pending_amount),
      totalPayments: payments.length,
      totalAmount: total(payments),
      verifiedPayments: verifiedList.length,
      verifiedAmount: total(verifiedList),
      pendingVerification: pendingList.length,
      pendingAmount: total(pendingList),
      rejectedPayments: rejectedList.length,
      rejectedAmount: total(rejectedList),
    },
    salesPersons: salesPersons.map((u) => ({ id: u.id, name: u.name })),
    vendors: vendors.map((v) => ({ id: v.id, name: v.company_name })),
  });
};

// GET /api/payments/:id
exports.getOne = async (req, res) => {
  const user = req.user;
  const id = toId(req.params.id);
  const row = await Payment.row({ $or: [...(id !== null ? [{ id }] : []), { payment_number: String(req.params.id) }] });
  const [payment] = row ? await decoratePayments([row], { withUpdatedBy: false }) : [];

  if (!payment) return res.status(404).json({ error: 'Payment record not found' });
  if (user.role_slug === 'sales_person' && payment.sales_person_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden: Access denied. You can only view payments for your own orders.' });
  }
  res.json({ payment });
};

// GET /api/orders/:id/payments
exports.listForOrder = async (req, res) => {
  const user = req.user;
  const order = await findOrderByIdOrNumber(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (user.role_slug === 'sales_person' && order.sales_person_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden: Access denied. You can only view payments for your own orders.' });
  }

  const rows = await Payment.rows({ order_id: order.id }, { sort: { id: -1 } });
  const users = await User.byIds(uniq(rows.flatMap((p) => [p.received_by_id, p.verified_by_id])), 'id name');
  const payments = rows.map((p) => ({
    ...p,
    received_by_name: users.get(p.received_by_id)?.name ?? null,
    submitted_by_name: users.get(p.received_by_id)?.name ?? null,
    verified_by_name: users.get(p.verified_by_id)?.name ?? null,
  }));
  res.json({ payments });
};

// Shared payment submission ( always starts as PENDING_VERIFICATION )
async function submitPayment(req, res, targetOrderId) {
  const user = req.user;
  const body = req.body || {};
  const canSubmit =
    ['super_admin', 'admin', 'accounts', 'sales_person'].includes(user.role_slug) ||
    ['payments:add', 'payments:submit', 'payments.add', 'payments.submit'].some((p) => user.permissions.includes(p));
  if (!canSubmit) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to submit payment entries' });
  }

  const orderId = targetOrderId || body.order_id;
  if (!orderId) return res.status(400).json({ error: 'Please select an Order.' });

  const order = await findOrderByIdOrNumber(orderId);
  if (!order) return res.status(404).json({ error: 'Selected Order does not exist' });
  if (order.order_status === 'CANCELLED') {
    return res.status(400).json({ error: 'Cannot record payment for a cancelled order' });
  }
  // Ownership is derived from the order, never from the client
  if (user.role_slug === 'sales_person' && order.sales_person_id !== user.id) {
    return res.status(403).json({ error: "You cannot submit payment against another Sales Person's order" });
  }

  const { amount, payment_date, payment_mode, reference_number, proof_url, notes } = body;
  const paymentAmt = Number(amount);
  if (isNaN(paymentAmt) || paymentAmt <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than ₹0.' });
  }

  // Fresh verified total -> prevents over-payment
  const verifiedRows = await Payment.rows(
    { order_id: order.id, $or: [{ is_verified: 1 }, { status: 'VERIFIED' }] },
    { select: 'amount' }
  );
  const currentVerified = sumBy(verifiedRows, (p) => p.amount);
  const currentPending = Math.max(0, order.grand_total - currentVerified);

  if (currentPending <= 0) {
    return res.status(400).json({ error: 'This order is already fully paid. No pending balance remains.' });
  }
  // Extra cash is allowed: the part above the pending amount is saved as party credit once Accounts verifies it
  const excessAmt = Math.max(0, round2(paymentAmt - currentPending));

  const id = await Payment.nextId();
  const payNumber = `PAY-${10000 + id}`;

  // base64 proof -> file on disk, DB keeps only the path
  const proofPath = await resolveFileInput(proof_url || null, 'payments', req);

  await Payment.insert({
    id,
    payment_number: payNumber,
    order_id: order.id,
    amount: paymentAmt,
    payment_date: payment_date || new Date().toISOString().slice(0, 10),
    payment_mode: payment_mode || 'Bank Transfer',
    reference_number: reference_number || `TXN-${Date.now().toString().slice(-6)}`,
    proof_url: proofPath || null,
    status: 'PENDING_VERIFICATION',
    notes: excessAmt > 0 ? `${notes ? notes + ' | ' : ''}Includes ₹${inr(excessAmt)} extra - will be saved as party credit` : notes || null,
    is_verified: 0,
    received_by_id: user.id,
  });

  await addHistory(
    order.id, 'Payment Submitted', order.payment_status, order.payment_status,
    `Payment entry ${payNumber} of ₹${inr(paymentAmt)} submitted by ${user.name} via ${payment_mode || 'Bank Transfer'} (Ref: ${reference_number || 'N/A'}). Awaiting Accounts Verification.`,
    user.id
  );
  await logActivity(user.id, 'PAYMENT_SUBMITTED', 'payment', payNumber, `${user.name} submitted payment ${payNumber} of ₹${inr(paymentAmt)} for ${order.order_number} (Pending Accounts Verification)`);
  await sendNotification(null, 'accounts', 'Pending Payment Verification', `New payment ${payNumber} of ₹${inr(paymentAmt)} submitted for ${order.order_number} by ${user.name}`, 'warning', order.id);

  return res.json({
    success: true,
    message: excessAmt > 0
      ? `Payment submitted. ₹${inr(excessAmt)} is extra and will be saved as party credit after Accounts verification.`
      : 'Payment submitted successfully and sent for Accounts verification.',
    excess_amount: excessAmt,
    payment_id: id,
    payment_number: payNumber,
    status: 'PENDING_VERIFICATION',
    amount: paymentAmt,
    current_verified: currentVerified,
    pending_amount: currentPending,
  });
}

exports.addForOrder = (req, res) => submitPayment(req, res, req.params.id);
exports.create = (req, res) => submitPayment(req, res, req.body && req.body.order_id);

// POST /api/payments/:id/verify
exports.verify = async (req, res) => {
  const user = req.user;
  const id = toId(req.params.id);
  const payment = id === null ? null : await Payment.row({ id });
  if (!payment) return res.status(404).json({ error: 'Payment record not found' });
  if (payment.is_verified === 1) return res.status(400).json({ error: 'Payment is already verified' });

  await Payment.updateOne({ id }, { $set: { is_verified: 1, status: 'VERIFIED', verified_by_id: user.id, verified_at: nowStr() } });

  const order = await Order.row({ id: payment.order_id });
  const ledger = await recalcOrderLedger(order, { userId: user.id });

  await addHistory(order.id, 'Payment Verified', order.payment_status, ledger.status, `Accounts verified payment of ₹${inr(payment.amount)} (${payment.payment_mode} - Ref: ${payment.reference_number || 'N/A'}). Ledger updated.${ledger.excess > 0 ? ` Extra ₹${inr(ledger.excess)} saved as party credit.` : ''}`, user.id);
  await logActivity(user.id, 'PAYMENT_VERIFIED', 'payment', payment.payment_number, `${user.name} approved and verified payment ${payment.payment_number} of ₹${inr(payment.amount)}`);
  await sendNotification(payment.received_by_id, null, 'Payment Approved', `Your submitted payment of ₹${inr(payment.amount)} for order ${order.order_number} has been verified by Accounts`, 'success', order.id);

  res.json({
    message: `Payment of ₹${inr(payment.amount)} verified successfully. Ledger and order balance updated.`,
    amount_received: ledger.received,
    pending_amount: ledger.pending,
    payment_status: ledger.status,
    excess_amount: ledger.excess,
  });
};

// POST /api/payments/:id/reject
exports.reject = async (req, res) => {
  const user = req.user;
  const id = toId(req.params.id);
  const { rejection_reason } = req.body;
  if (!rejection_reason || !String(rejection_reason).trim()) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }
  const reason = String(rejection_reason).trim();

  const payment = id === null ? null : await Payment.row({ id });
  if (!payment) return res.status(404).json({ error: 'Payment record not found' });
  if (payment.is_verified === 1) {
    return res.status(400).json({ error: 'Cannot reject a payment that has already been verified' });
  }

  await Payment.updateOne(
    { id },
    { $set: { is_verified: -1, status: 'REJECTED', rejection_reason: reason, verified_by_id: user.id, verified_at: nowStr() } }
  );

  const order = await Order.row({ id: payment.order_id });
  await addHistory(order.id, 'Payment Rejected', order.payment_status, order.payment_status, `Payment of ₹${inr(payment.amount)} rejected by Accounts. Reason: ${reason}`, user.id);
  await logActivity(user.id, 'PAYMENT_REJECTED', 'payment', payment.payment_number, `${user.name} rejected payment ${payment.payment_number}: ${reason}`);
  await sendNotification(payment.received_by_id, null, 'Payment Rejected', `Payment of ₹${inr(payment.amount)} for order ${order.order_number} was rejected: ${reason}`, 'warning', order.id);

  res.json({ message: 'Payment rejected. Submitting user has been notified.' });
};

// PUT /api/payments/:id  ( edit same payment id )
exports.update = async (req, res) => {
  const user = req.user;
  const id = toId(req.params.id);
  const payment = id === null ? null : await Payment.row({ id });
  if (!payment) return res.status(404).json({ error: 'Payment entry not found' });

  const order = await Order.row({ id: payment.order_id });
  if (!order) return res.status(404).json({ error: 'Associated order not found' });

  const isAdmin = ['admin', 'super_admin'].includes(user.role_slug);
  const hasAccountsOrAdminPerm =
    isAdmin || user.role_slug === 'accounts' || user.permissions.includes('payments:verify') || user.permissions.includes('payments:manage');

  // Verified payments: Admin / Super Admin / Accounts only.
  // Pending / rejected: submitter, order's sales person or anyone allowed to add payments.
  if (payment.is_verified === 1) {
    if (!hasAccountsOrAdminPerm) {
      return res.status(403).json({ error: 'Access denied: Verified / approved payments can only be edited by Admin, Super Admin, or Accounts.' });
    }
  } else {
    const canEditPending =
      hasAccountsOrAdminPerm || payment.received_by_id === user.id || order.sales_person_id === user.id ||
      user.permissions.includes('payments:add') || user.permissions.includes('payments:submit');
    if (!canEditPending) {
      return res.status(403).json({ error: 'Access denied: You do not have permission to edit this payment entry.' });
    }
  }

  if (payment.payment_mode === 'Party Credit') {
    return res.status(400).json({ error: 'Party credit adjustments cannot be edited.' });
  }

  const { amount, payment_date, payment_mode, reference_number, proof_url, notes } = req.body;
  const newAmount = amount !== undefined ? Number(amount) : payment.amount;
  if (isNaN(newAmount) || newAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount greater than 0 is required.' });
  }

  const trimOrNull = (v) => (v ? String(v).trim() : null);
  const oldAmount = payment.amount;
  const updatedMode = payment_mode || payment.payment_mode;
  const updatedRef = reference_number !== undefined ? trimOrNull(reference_number) : payment.reference_number;

  // base64 proof -> file on disk, DB keeps only the path
  const newProof = proof_url !== undefined ? await resolveFileInput(trimOrNull(proof_url), 'payments', req) : payment.proof_url;

  await Payment.updateOne(
    { id },
    {
      $set: {
        amount: newAmount,
        payment_date: payment_date || payment.payment_date,
        payment_mode: updatedMode,
        reference_number: updatedRef,
        proof_url: newProof,
        notes: notes !== undefined ? trimOrNull(notes) : payment.notes,
        updated_by_id: user.id,
        updated_at: nowStr(),
      },
    }
  );

  // proof replaced or removed -> delete old file from disk
  if (payment.proof_url && payment.proof_url !== newProof) await deleteUploaded(payment.proof_url);

  // Order Total -> Verified Received -> Balance Payment
  const ledger = await recalcOrderLedger(order, { rounded: true, userId: user.id });

  await addHistory(
    order.id, 'Payment Edited', order.payment_status, ledger.status,
    `Payment entry #${payment.payment_number} (${payment.is_verified === 1 ? 'Verified' : 'Pending'}) edited by ${user.name}: Amount ₹${inr(oldAmount)} -> ₹${inr(newAmount)}, Mode: ${updatedMode}, Ref: ${updatedRef || 'N/A'}. Order balances updated.`,
    user.id
  );
  await logActivity(user.id, 'PAYMENT_UPDATED', 'payment', payment.payment_number, `${user.name} edited payment #${payment.payment_number} for order ${order.order_number}: ₹${inr(oldAmount)} -> ₹${inr(newAmount)}`);

  const fresh = await Payment.row({ id });
  const [vendor, company, users] = await Promise.all([
    Vendor.row({ id: order.vendor_id }, { select: 'company_name' }),
    Company.row({ id: order.company_id }, { select: 'name' }),
    User.byIds([fresh.received_by_id, fresh.verified_by_id, fresh.updated_by_id], 'id name'),
  ]);

  res.json({
    success: true,
    message: 'Payment updated successfully.',
    payment: {
      ...fresh,
      order_number: order.order_number,
      total_order_amount: order.grand_total,
      pending_amount: ledger.pending,
      vendor_name: vendor?.company_name ?? null,
      billing_company_name: company?.name ?? null,
      received_by_name: users.get(fresh.received_by_id)?.name ?? null,
      verified_by_name: users.get(fresh.verified_by_id)?.name ?? null,
      updated_by_name: users.get(fresh.updated_by_id)?.name ?? null,
    },
    order: {
      id: order.id,
      grand_total: order.grand_total,
      amount_received: ledger.received,
      pending_amount: ledger.pending,
      payment_status: ledger.status,
    },
  });
};

exports.recalcOrderLedger = recalcOrderLedger;
