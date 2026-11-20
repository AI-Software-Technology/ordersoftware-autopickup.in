// Bills / Invoices - a read-only view built from Orders & verified Payments
const { taxRegime, splitTax } = require('../utils/gst');
const { Order, OrderItem, Payment, Vendor, User, Company, Product, Delivery } = require('../models');
const { toId, like, round2, addDateRange, sumBy, uniq } = require('../utils/helpers');
const { loadOrderRefs, loadItemsByOrder, summarizeItems, resolveIdsByIdOrName, isActive } = require('../utils/queries');

function billAccess(user) {
  const isSuperAdmin = user.role_slug === 'super_admin';
  const isAdmin = user.role_slug === 'admin' || isSuperAdmin;
  const isAccounts = user.role_slug === 'accounts';
  return {
    canViewAll: isSuperAdmin || isAdmin || isAccounts || user.permissions.includes('bills:view_all'),
    canViewOwn: user.permissions.includes('bills:view_own') || user.role_slug === 'sales_person',
  };
}

// Reverse GST split + paid / partial / unpaid status
function billFigures(billAmountRaw, receivedRaw, pendingRaw, taxType, regime = 'CGST_SGST') {
  const isNonGst = taxType === 'NON_GST';
  const billAmt = Number(billAmountRaw) || 0;
  const recAmt = Number(receivedRaw) || 0;
  const balAmt = Math.max(0, Number(pendingRaw) || billAmt - recAmt);

  const taxableAmt = isNonGst ? billAmt : round2(billAmt / 1.18);
  const gstAmt = isNonGst ? 0 : round2(billAmt - taxableAmt);
  const split = splitTax(gstAmt, isNonGst ? 'NONE' : regime);
  const cgstAmt = split.cgst;
  const sgstAmt = split.sgst;
  const igstAmt = split.igst;

  let pStatus = 'UNPAID';
  if (balAmt <= 0 && recAmt > 0) pStatus = 'PAID';
  else if (recAmt > 0) pStatus = 'PARTIAL';

  return {
    isNonGst,
    figures: {
      bill_amount: billAmt, taxable_amount: taxableAmt, gst_amount: gstAmt, cgst_amount: cgstAmt,
      sgst_amount: sgstAmt, igst_amount: igstAmt, tax_regime: isNonGst ? 'NONE' : regime, received_amount: recAmt, balance_payment: balAmt, payment_status: pStatus,
    },
  };
}

const invoiceNo = (orderNumber) => String(orderNumber).replace('ORD-', 'INV-');
const panOf = (gst) => (gst ? String(gst).substr(2, 10) : null);

const companyFields = (c, withLogo = false) => ({
  company_name: c?.name ?? null, company_code: c?.code ?? null, ...(withLogo ? { company_logo: c?.logo_url ?? null } : {}), company_gstin: c?.gst_number ?? null,
  company_pan: panOf(c?.gst_number), company_address: c?.address ?? null, company_city: c?.city ?? null,
  company_state: c?.state ?? null, company_pincode: c?.pincode ?? null, company_mobile: c?.mobile ?? null,
  company_email: c?.email ?? null, company_bank: c?.bank_name ?? null, company_account: c?.account_no ?? null,
  company_ifsc: c?.ifsc_code ?? null, company_branch: c?.branch ?? null, company_terms: c?.terms ?? null,
});

// GET /api/bills
exports.list = async (req, res) => {
  const user = req.user;
  const { canViewAll, canViewOwn } = billAccess(user);
  if (!canViewAll && !canViewOwn) {
    return res.status(403).json({ error: 'Access denied: You do not have permission to access the Bills module.' });
  }

  const { tax_type, startDate, endDate, date_from, date_to, vendor_id, party_id, sales_person_id, payment_status, search } = req.query;
  const sDate = startDate || date_from;
  const eDate = endDate || date_to;
  const vId = party_id || vendor_id;

  const and = [{ order_status: { $ne: 'CANCELLED' } }];

  // Security Rule: Sales Person or view_own can ONLY see their own bills
  if (user.role_slug === 'sales_person' || (!canViewAll && canViewOwn)) {
    and.push({ sales_person_id: user.id });
  } else if (isActive(sales_person_id)) {
    and.push({ sales_person_id: { $in: await resolveIdsByIdOrName(User, 'name', sales_person_id) } });
  }

  if (isActive(tax_type)) {
    if (tax_type === 'GST' || tax_type === 'GST_18') and.push({ tax_type: { $in: ['GST_18', null, ''] } });
    else if (tax_type === 'NON_GST') and.push({ tax_type: 'NON_GST' });
  }

  if (isActive(vId)) and.push({ vendor_id: { $in: await resolveIdsByIdOrName(Vendor, 'company_name', vId) } });

  if (isActive(payment_status)) {
    if (payment_status === 'PAID') and.push({ pending_amount: { $lte: 0 }, amount_received: { $gt: 0 } });
    else if (payment_status === 'PARTIAL') and.push({ amount_received: { $gt: 0 }, pending_amount: { $gt: 0 } });
    else if (payment_status === 'UNPAID') and.push({ $or: [{ amount_received: { $lte: 0 } }, { amount_received: null }] });
    else and.push({ payment_status: String(payment_status) });
  }

  if (sDate || eDate) and.push(addDateRange({}, 'created_at', sDate, eDate));

  let rows = await Order.rows({ $and: and }, { sort: { id: -1 } });
  const refs = await loadOrderRefs(rows);

  if (search) {
    const rx = like(search);
    rows = rows.filter(
      (o) =>
        rx.test(o.order_number) || rx.test(invoiceNo(o.order_number)) ||
        rx.test(refs.vendors.get(o.vendor_id)?.company_name || '') ||
        rx.test(refs.users.get(o.sales_person_id)?.name || '')
    );
  }
  const itemsMap = await loadItemsByOrder(rows.map((o) => o.id));

  const summary = { total_bills: 0, gst_bills: 0, non_gst_bills: 0, total_billing_amount: 0, total_received: 0, balance_payment: 0 };

  const bills = rows.map((o) => {
    const v = refs.vendors.get(o.vendor_id);
    const u = refs.users.get(o.sales_person_id);
    const c = refs.companies.get(o.company_id);
    const { isNonGst, figures } = billFigures(o.grand_total, o.amount_received, o.pending_amount, o.tax_type, taxRegime(o.tax_type, v?.state, c?.state));
    const itemSummary = summarizeItems(itemsMap.get(o.id) || []);

    summary.total_bills += 1;
    if (isNonGst) summary.non_gst_bills += 1;
    else summary.gst_bills += 1;
    summary.total_billing_amount += figures.bill_amount;
    summary.total_received += figures.received_amount;
    summary.balance_payment += figures.balance_payment;

    return {
      id: o.id,
      order_id: o.id,
      order_number: o.order_number,
      invoice_number: invoiceNo(o.order_number),
      order_date: o.created_at,
      invoice_date: o.created_at,
      created_at: o.created_at,
      order_status: o.order_status,
      tax_rate: o.tax_rate,
      subtotal: o.subtotal,
      tax_amount: o.tax_amount,
      payment_terms: o.payment_terms,
      notes: o.notes,
      party_id: v?.id ?? null, party_name: v?.company_name ?? null, party_city: v?.city ?? null,
      party_state: v?.state ?? null, party_gstin: v?.gstin ?? null, party_mobile: v?.mobile ?? null,
      party_address: v?.billing_address ?? null,
      company_id: c?.id ?? null,
      ...companyFields(c),
      sales_person_id: u?.id ?? null, sales_person_name: u?.name ?? null,
      sales_person_mobile: u?.mobile ?? null, sales_person_email: u?.email ?? null,
      item_count: itemSummary.item_count,
      total_quantity: itemSummary.total_quantity,
      products_summary: itemSummary.products_summary,
      tax_type: isNonGst ? 'NON_GST' : 'GST_18',
      ...figures,
    };
  });

  res.json({
    bills,
    summary: {
      ...summary,
      total_billing_amount: round2(summary.total_billing_amount),
      total_received: round2(summary.total_received),
      balance_payment: round2(summary.balance_payment),
    },
  });
};

// GET /api/bills/:id
exports.getOne = async (req, res) => {
  const user = req.user;
  const { canViewAll, canViewOwn } = billAccess(user);
  if (!canViewAll && !canViewOwn) {
    return res.status(403).json({ error: 'Access denied: You do not have permission to view bills.' });
  }

  const id = toId(req.params.id);
  const o = id === null ? null : await Order.row({ id });
  if (!o) return res.status(404).json({ error: 'Bill/Order not found' });

  if (!canViewAll && canViewOwn && o.sales_person_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden: You can only view your own bills.' });
  }

  const [v, u, c, rawItems, paymentRows] = await Promise.all([
    Vendor.row({ id: o.vendor_id }),
    User.row({ id: o.sales_person_id }, { select: 'id name mobile email' }),
    Company.row({ id: o.company_id }),
    OrderItem.rows({ order_id: id }, { sort: { id: 1 } }),
    Payment.rows({ order_id: id, is_verified: 1 }, { sort: { payment_date: 1, id: 1 } }),
  ]);
  const [products, payUsers] = await Promise.all([
    Product.byIds(uniq(rawItems.map((i) => i.product_id)), 'id description image_url'),
    User.byIds(uniq(paymentRows.flatMap((p) => [p.received_by_id, p.verified_by_id])), 'id name'),
  ]);

  const regime = taxRegime(o.tax_type, v?.state, c?.state);
  const { figures } = billFigures(o.grand_total, o.amount_received, o.pending_amount, o.tax_type, regime);

  // ---- shipment invoices ( one per delivery ) ----
  // Verified cash of the order is applied to shipments oldest-first. Cash not yet used
  // ( advance ) stays on the order and covers the next shipment automatically.
  const deliveries = (await Delivery.rows({ order_id: id }, { sort: { id: 1 } })).filter((d) => d.invoice_number);
  const itemById = new Map(rawItems.map((i) => [i.id, i]));
  let cashPool = round2(o.amount_received || 0);
  const shipments = deliveries.map((d) => {
    const applied = round2(Math.min(d.invoice_total || 0, cashPool));
    cashPool = round2(cashPool - applied);
    const taxable = d.tax_type === 'NON_GST' ? d.invoice_total : d.subtotal;
    return {
      id: d.id, shipment_no: d.shipment_no, invoice_number: d.invoice_number, invoice_date: d.delivery_date,
      is_partial: d.is_partial === 1, tax_type: d.tax_type, delivered_quantity: d.delivered_quantity,
      taxable_amount: taxable, gst_amount: d.tax_amount, tax_regime: d.tax_type === 'NON_GST' ? 'NONE' : regime,
      cgst_amount: splitTax(d.tax_amount, d.tax_type === 'NON_GST' ? 'NONE' : regime).cgst,
      sgst_amount: splitTax(d.tax_amount, d.tax_type === 'NON_GST' ? 'NONE' : regime).sgst,
      igst_amount: splitTax(d.tax_amount, d.tax_type === 'NON_GST' ? 'NONE' : regime).igst,
      bill_amount: d.invoice_total, paid_amount: applied, balance_amount: round2((d.invoice_total || 0) - applied),
      items: (d.items || []).map((l) => {
        const it = itemById.get(l.order_item_id);
        return {
          order_item_id: l.order_item_id, product_name: it?.product_name ?? null, sku: it?.sku ?? null, unit: it?.unit ?? null,
          quantity: l.quantity, rate: it?.rate ?? 0, line_amount: round2(l.quantity * (it?.rate ?? 0)),
          item_colour: it?.item_colour ?? '',
        };
      }),
    };
  });
  const invoicedTotal = round2(sumBy(shipments, (s) => s.bill_amount));
  const remainingValue = round2(Math.max(0, o.grand_total - invoicedTotal));
  const pendingItems = rawItems
    .map((i) => ({ product_name: i.product_name, unit: i.unit, quantity: Math.max(0, i.quantity - (i.delivered_quantity || 0)), rate: i.rate }))
    .filter((i) => i.quantity > 0);
  const vendorCredit = round2(v?.credit_balance || 0);

  const bill = {
    ...o,
    invoice_number: invoiceNo(o.order_number),
    order_date: o.created_at,
    invoice_date: o.created_at,
    party_name: v?.company_name ?? null, party_contact: v?.contact_person ?? null, party_city: v?.city ?? null,
    party_state: v?.state ?? null, party_address: v?.billing_address ?? null, party_gstin: v?.gstin ?? null,
    party_mobile: v?.mobile ?? null, party_email: v?.email ?? null,
    party_aadhar: v?.aadhaar_no ?? null,
    ...companyFields(c, true),
    sales_person_name: u?.name ?? null, sales_person_mobile: u?.mobile ?? null, sales_person_email: u?.email ?? null,
    ...figures,
    shipments,
    // advance already received that will cover the units still to be shipped
    advance_for_pending: round2(Math.min(cashPool, remainingValue)),
    pending_items: pendingItems,
    pending_value: remainingValue,
    excess_credit: round2(o.excess_amount || 0),
    party_credit_balance: vendorCredit,
    items: rawItems.map((i) => ({
      ...i,
      product_description: products.get(i.product_id)?.description ?? null,
      product_image: products.get(i.product_id)?.image_url ?? null,
    })),
    payments: paymentRows.map((p) => ({
      ...p,
      received_by_name: payUsers.get(p.received_by_id)?.name ?? null,
      verified_by_name: payUsers.get(p.verified_by_id)?.name ?? null,
    })),
  };

  res.json({ bill });
};
