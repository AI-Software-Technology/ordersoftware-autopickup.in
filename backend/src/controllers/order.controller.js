const {
  Order, OrderItem, Vendor, User, Role, Company, Product, ProductionRecord, Dispatch, Delivery,
  Payment, OrderStatusHistory, ActivityLog, Notification,
} = require('../models');
const { logActivity, sendNotification, addHistory } = require('../utils/audit');
const { toId, like, nowStr, round2, addDateRange, sumBy, uniq, inr } = require('../utils/helpers');
const {
  loadOrderRefs, loadItemsByOrder, loadProductsFor, summarizeItems, resolveIdsByIdOrName, idsMatching,
  isActive, DEFAULT_PRODUCT_IMAGE,
} = require('../utils/queries');

const { applyCreditToOrder } = require('./credit.controller');
const { taxRegime } = require('../utils/gst');

const findOrder = (idParam) => {
  const id = toId(idParam);
  return id === null ? null : Order.row({ id });
};

// GST is inclusive in the entered selling rate ( reverse 18% )
// Discount applied on gross (incl. GST) total -> grand total -> reverse GST
function computeTotals(items, taxType, discountType = 'NONE', discountValue = 0) {
  let gross = 0;
  for (const it of items) {
    if (!it.product_id || Number(it.quantity) <= 0 || Number(it.rate) <= 0 || isNaN(Number(it.quantity)) || isNaN(Number(it.rate))) {
      return { error: 'All product rows must have valid product, quantity > 0, and rate > 0' };
    }
    gross += round2(Number(it.quantity) * Number(it.rate));
  }
  gross = round2(gross);

  const dType = ['PERCENT', 'FLAT'].includes(String(discountType)) ? String(discountType) : 'NONE';
  const dValue = Number(discountValue) || 0;
  if (dType !== 'NONE') {
    if (dValue < 0) return { error: 'Discount cannot be negative' };
    if (dType === 'PERCENT' && dValue > 100) return { error: 'Discount percentage cannot exceed 100%' };
    if (dType === 'FLAT' && dValue > gross) return { error: 'Discount amount cannot exceed order total' };
  }
  const discountAmount = dType === 'PERCENT' ? round2((gross * dValue) / 100) : dType === 'FLAT' ? round2(dValue) : 0;
  const grandTotal = round2(gross - discountAmount);

  const isNonGst = taxType === 'NON_GST';
  const subtotal = isNonGst ? grandTotal : round2(grandTotal / 1.18);
  return {
    grossAmount: gross,
    discountType: discountAmount > 0 ? dType : 'NONE',
    discountValue: discountAmount > 0 ? dValue : 0,
    discountAmount,
    grandTotal,
    isNonGst,
    subtotal,
    taxRate: isNonGst ? 0 : 18.0,
    taxAmount: isNonGst ? 0 : round2(grandTotal - subtotal),
  };
}

// ---------------------------------------------------------------------------
// GET /api/orders  ( paginated list with filters )
// ---------------------------------------------------------------------------
exports.list = async (req, res) => {
  const user = req.user;
  const canViewAll = user.role_slug === 'super_admin' || user.permissions.includes('orders:view_all');
  const canViewOwn = user.permissions.includes('orders:view_own') || user.role_slug === 'sales_person';
  const otherAllowed =
    user.permissions.includes('packing:view') || user.permissions.includes('dispatch:view') ||
    user.permissions.includes('payments:view') || user.role_slug === 'admin';
  if (!canViewAll && !canViewOwn && !otherAllowed) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to view orders' });
  }

  const {
    search, status, vendor_id, sales_person_id, company_id, product_id, tax_type,
    startDate, endDate, date_from, date_to, page = 1, limit = 20,
  } = req.query;
  const sDate = startDate || date_from;
  const eDate = endDate || date_to;

  const and = [];

  // Security Rule: Sales Person or view_own only sees own orders
  if (user.role_slug === 'sales_person' || (!canViewAll && canViewOwn)) {
    and.push({ sales_person_id: user.id });
  } else if (isActive(sales_person_id)) {
    and.push({ sales_person_id: { $in: await resolveIdsByIdOrName(User, 'name', sales_person_id) } });
  }

  if (isActive(status)) {
    if (status === 'APPROVED' || status === 'ACCEPTED') {
      and.push({ order_status: { $in: ['ACCEPTED', 'APPROVED'] } });
    } else if (status === 'PACKING' || status === 'PROCESSING') {
      and.push({
        $or: [
          { order_status: { $in: ['PROCESSING', 'PACKING', 'READY_FOR_DISPATCH'] } },
          { packing_status: { $in: ['PACKING_IN_PROGRESS', 'IN_PROGRESS', 'PACKED', 'HANDED_OVER', 'ON_HOLD'] } },
        ],
      });
      and.push({ order_status: { $nin: ['DELIVERED', 'COMPLETED', 'CANCELLED', 'NEW', 'ACCEPTED', 'APPROVED'] } });
    } else if (status === 'DELIVERED') {
      and.push({ $or: [{ order_status: { $in: ['DELIVERED', 'COMPLETED'] } }, { delivery_status: 'DELIVERED' }] });
    } else {
      and.push({ order_status: String(status) });
    }
  }

  if (isActive(vendor_id)) {
    and.push({ vendor_id: { $in: await resolveIdsByIdOrName(Vendor, 'company_name', vendor_id) } });
  }
  if (isActive(company_id)) and.push({ company_id: Number(company_id) });

  if (isActive(product_id)) {
    const pid = toId(product_id);
    const rows = await OrderItem.rows(
      { $or: [...(pid !== null ? [{ product_id: pid }] : []), { sku: String(product_id) }] },
      { select: 'order_id' }
    );
    and.push({ id: { $in: uniq(rows.map((r) => r.order_id)) } });
  }

  if (isActive(tax_type)) and.push({ tax_type: String(tax_type) });

  if (search) {
    const rx = like(search);
    const [vendorIds, userIds, itemRows] = await Promise.all([
      idsMatching(Vendor, ['company_name'], search),
      idsMatching(User, ['name'], search),
      OrderItem.rows({ $or: [{ product_name: rx }, { sku: rx }] }, { select: 'order_id' }),
    ]);
    and.push({
      $or: [
        { order_number: rx },
        { vendor_id: { $in: vendorIds } },
        { sales_person_id: { $in: userIds } },
        { id: { $in: uniq(itemRows.map((r) => r.order_id)) } },
      ],
    });
  }

  if (sDate || eDate) and.push(addDateRange({}, 'created_at', sDate, eDate));

  const filter = and.length ? { $and: and } : {};
  const pageNum = parseInt(page, 10) || 1;
  const pageLimit = parseInt(limit, 10) || 20;

  const [totalCount, rows] = await Promise.all([
    Order.countDocuments(filter),
    Order.rows(filter, { sort: { id: -1 }, skip: (pageNum - 1) * pageLimit, limit: pageLimit }),
  ]);

  const [refs, itemsMap] = await Promise.all([loadOrderRefs(rows), loadItemsByOrder(rows.map((o) => o.id))]);
  const products = await Product.byIds(uniq([...itemsMap.values()].flat().map((i) => i.product_id)), 'id image_url');

  const orders = rows.map((o) => {
    const v = refs.vendors.get(o.vendor_id);
    const c = refs.companies.get(o.company_id);
    const items = itemsMap.get(o.id) || [];
    return {
      ...o,
      vendor_name: v?.company_name ?? null,
      vendor_city: v?.city ?? null,
      vendor_state: v?.state ?? null,
      tax_regime: taxRegime(o.tax_type, v?.state, c?.state),
      sales_person_name: refs.users.get(o.sales_person_id)?.name ?? null,
      billing_company_name: c?.name ?? null,
      billing_company_code: c?.code ?? null,
      ...summarizeItems(items),
      items: items.map((i) => ({
        id: i.id, product_id: i.product_id, product_name: i.product_name, sku: i.sku, quantity: i.quantity, unit: i.unit,
        product_image: products.get(i.product_id)?.image_url ?? DEFAULT_PRODUCT_IMAGE(120),
      })),
    };
  });

  res.json({
    orders,
    pagination: { total: totalCount, page: pageNum, limit: pageLimit, totalPages: Math.ceil(totalCount / pageLimit) },
  });
};

// ---------------------------------------------------------------------------
// GET /api/orders/delivered
// ---------------------------------------------------------------------------
exports.listDelivered = async (req, res) => {
  const user = req.user;
  const canViewAll = user.role_slug === 'super_admin' || user.permissions.includes('orders:view_all');
  const canViewOwn = user.permissions.includes('orders:view_own') || user.role_slug === 'sales_person';
  const otherAllowed = user.permissions.includes('packing:view') || user.permissions.includes('payments:view') || user.role_slug === 'admin';
  if (!canViewAll && !canViewOwn && !otherAllowed) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to view delivered orders' });
  }

  const { search, sales_person_id, vendor_id, startDate, endDate, date_from, date_to } = req.query;
  const sDate = startDate || date_from;
  const eDate = endDate || date_to;

  const and = [{ $or: [{ order_status: { $in: ['DELIVERED', 'COMPLETED'] } }, { delivery_status: 'DELIVERED' }] }];

  if (user.role_slug === 'sales_person' || (!canViewAll && canViewOwn)) {
    and.push({ sales_person_id: user.id });
  } else if (isActive(sales_person_id)) {
    and.push({ sales_person_id: { $in: await resolveIdsByIdOrName(User, 'name', sales_person_id) } });
  }
  if (isActive(vendor_id)) {
    and.push({ vendor_id: { $in: await resolveIdsByIdOrName(Vendor, 'company_name', vendor_id) } });
  }
  if (sDate || eDate) {
    // delivered date, falling back to order date when not recorded
    and.push({
      $or: [
        addDateRange({}, 'delivered_at', sDate, eDate),
        { delivered_at: null, ...addDateRange({}, 'created_at', sDate, eDate) },
      ],
    });
  }
  if (search) {
    const rx = like(search);
    const [vendorIds, userIds] = await Promise.all([
      idsMatching(Vendor, ['company_name'], search),
      idsMatching(User, ['name'], search),
    ]);
    and.push({ $or: [{ order_number: rx }, { vendor_id: { $in: vendorIds } }, { sales_person_id: { $in: userIds } }] });
  }

  const rows = await Order.rows({ $and: and });
  const sortKey = (o) => o.delivered_at || o.updated_at || o.created_at || '';
  rows.sort((a, b) => (sortKey(a) === sortKey(b) ? b.id - a.id : sortKey(a) < sortKey(b) ? 1 : -1));

  const [refs, itemsMap] = await Promise.all([
    loadOrderRefs(rows, { companies: false }),
    loadItemsByOrder(rows.map((o) => o.id)),
  ]);

  const orders = rows.map((o) => {
    const items = itemsMap.get(o.id) || [];
    return {
      id: o.id, order_number: o.order_number, order_status: o.order_status, grand_total: o.grand_total,
      amount_received: o.amount_received, pending_amount: o.pending_amount, payment_status: o.payment_status,
      delivery_address: o.delivery_address, delivered_at: o.delivered_at, created_at: o.created_at,
      delivered_by_name: o.delivered_by_name ?? 'Operations Team',
      vendor_name: refs.vendors.get(o.vendor_id)?.company_name ?? null,
      vendor_city: refs.vendors.get(o.vendor_id)?.city ?? null,
      sales_person_name: refs.users.get(o.sales_person_id)?.name ?? null,
      item_count: items.length,
      total_quantity: items.length ? sumBy(items, (i) => i.quantity) : null,
      items: items.map((i) => ({
        id: i.id, product_name: i.product_name, unit: i.unit, quantity: i.quantity,
        delivered_quantity: i.delivered_quantity, sku: i.sku,
      })),
    };
  });

  return res.json({
    orders,
    totalCount: orders.length,
    totalDeliveredValue: orders.reduce((acc, o) => acc + (o.grand_total || 0), 0),
  });
};

// ---------------------------------------------------------------------------
// GET /api/orders/:id  ( full order with items, payments, timeline ... )
// ---------------------------------------------------------------------------
exports.getOne = async (req, res) => {
  const user = req.user;
  const idParam = req.params.id;
  const numericId = toId(idParam);

  const o = await Order.row({
    $or: [...(numericId !== null ? [{ id: numericId }] : []), { order_number: String(idParam) }],
  });
  if (!o) return res.status(404).json({ error: 'Order not found' });

  // Security check: Sales Person only sees own orders
  if (user.role_slug === 'sales_person' && o.sales_person_id !== user.id) {
    return res.status(403).json({ error: 'Access denied: You can only view your own orders' });
  }

  const [v, u, c] = await Promise.all([
    Vendor.row({ id: o.vendor_id }),
    User.row({ id: o.sales_person_id }, { select: 'id name email mobile' }),
    Company.row({ id: o.company_id }),
  ]);

  const order = {
    ...o,
    vendor_name: v?.company_name ?? null, vendor_contact: v?.contact_person ?? null, vendor_mobile: v?.mobile ?? null,
    vendor_email: v?.email ?? null, vendor_gstin: v?.gstin ?? null, vendor_billing_address: v?.billing_address ?? null,
    vendor_aadhar: v?.aadhaar_no || null,
    vendor_delivery_address: v?.delivery_address ?? null, vendor_city: v?.city ?? null, vendor_state: v?.state ?? null,
    vendor_pincode: v?.pincode ?? null,
    tax_regime: taxRegime(o.tax_type, v?.state, c?.state),
    sales_person_name: u?.name ?? null, sales_person_email: u?.email ?? null, sales_person_mobile: u?.mobile ?? null,
    billing_company_name: c?.name ?? null, billing_company_code: c?.code ?? null, billing_company_logo: c?.logo_url ?? null,
    billing_company_gst: c?.gst_number ?? null, billing_company_address: c?.address ?? null,
    billing_company_city: c?.city ?? null, billing_company_state: c?.state ?? null,
    billing_company_pincode: c?.pincode ?? null, billing_company_mobile: c?.mobile ?? null,
    billing_company_email: c?.email ?? null, billing_company_bank: c?.bank_name ?? null,
    billing_company_account: c?.account_no ?? null, billing_company_ifsc: c?.ifsc_code ?? null,
    billing_company_branch: c?.branch ?? null, billing_company_terms: c?.terms ?? null,
  };

  const [rawItems, prodRecords, dispatchRows, deliveryRows, paymentRows, historyRows, logRows] = await Promise.all([
    OrderItem.rows({ order_id: o.id }, { sort: { id: 1 } }),
    ProductionRecord.rows({ order_id: o.id }, { sort: { id: -1 } }),
    Dispatch.rows({ order_id: o.id }, { sort: { id: -1 } }),
    Delivery.rows({ order_id: o.id }, { sort: { id: -1 } }),
    Payment.rows({ order_id: o.id }, { sort: { id: -1 } }),
    OrderStatusHistory.rows({ order_id: o.id }, { sort: { id: 1 } }),
    ActivityLog.rows({ entity_id: { $in: [String(o.id), o.order_number] } }, { sort: { id: -1 } }),
  ]);

  const userIds = uniq([
    ...prodRecords.map((r) => r.created_by_id), ...dispatchRows.map((r) => r.created_by_id),
    ...deliveryRows.map((r) => r.created_by_id), ...paymentRows.flatMap((r) => [r.received_by_id, r.verified_by_id]),
    ...historyRows.map((r) => r.created_by_id), ...logRows.map((r) => r.user_id),
  ]);
  const [users, products] = await Promise.all([
    User.byIds(userIds, 'id name role_id'),
    loadProductsFor(rawItems, { withBrand: true }),
  ]);
  const roles = await Role.byIds(uniq([...users.values()].map((x) => x.role_id)), 'id name');
  const uname = (id) => users.get(id)?.name ?? null;
  const itemMap = new Map(rawItems.map((i) => [i.id, i]));

  const items = rawItems
    .filter((i) => products.has(i.product_id))
    .map((i) => {
      const p = products.get(i.product_id);
      return { ...i, product_image: p.image_url, item_colour: (i.item_colour && i.item_colour !== 'Golden Yellow') ? i.item_colour : (p.item_colour || ''), brand_name: p.brand_name, category_name: p.category_name };
    });

  res.json({
    order,
    items,
    productionRecords: prodRecords.filter((r) => itemMap.has(r.order_item_id)).map((r) => ({
      ...r,
      product_name: itemMap.get(r.order_item_id)?.product_name ?? null,
      sku: itemMap.get(r.order_item_id)?.sku ?? null,
      logged_by_name: uname(r.created_by_id),
    })),
    dispatches: dispatchRows.map((d) => ({ ...d, dispatched_by_name: uname(d.created_by_id) })),
    deliveries: deliveryRows.map((d) => ({ ...d, logged_by_name: uname(d.created_by_id) })),
    payments: paymentRows.map((p) => ({ ...p, received_by_name: uname(p.received_by_id), verified_by_name: uname(p.verified_by_id) })),
    history: historyRows.map((h) => ({
      ...h,
      actor_name: uname(h.created_by_id),
      actor_role: roles.get(users.get(h.created_by_id)?.role_id)?.name ?? null,
    })),
    logs: logRows.map((a) => ({ ...a, actor_name: uname(a.user_id) })),
  });
};

// ---------------------------------------------------------------------------
// POST /api/orders  ( create )
// ---------------------------------------------------------------------------
exports.create = async (req, res) => {
  const user = req.user;
  const {
    company_id, vendor_id, items, transportName, transportAddress, booking_station, transport_contact_number,
    required_delivery_date, delivery_address, delivery_contact_person, delivery_contact_number,
    special_instructions, notes, payment_terms, tax_type = 'GST_18', use_credit = false,
    discount_type = 'NONE', discount_value = 0,
  } = req.body;

  if (!company_id || !vendor_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Billing Company, Vendor, and at least one Product are required' });
  }

  const vendor = await Vendor.row({ id: toId(vendor_id) });
  if (!vendor) return res.status(404).json({ error: 'Selected vendor does not exist' });
  if (vendor.status === 'inactive') {
    return res.status(400).json({ error: 'This party is inactive. Activate the party before creating an order.' });
  }
  if (user.role_slug === 'sales_person' && vendor.assigned_sales_person_id !== user.id) {
    return res.status(403).json({ error: 'Unauthorized: You can only create orders for your assigned vendors' });
  }
  if (!(await Company.exists({ id: toId(company_id) }))) {
    return res.status(404).json({ error: 'Selected billing company does not exist' });
  }

  // Estimated / Grand Total = SUM(Quantity * manually entered selling rate)
  const totals = computeTotals(items, tax_type, discount_type, discount_value);
  if (totals.error) return res.status(400).json({ error: totals.error });

  const products = await Product.byIds(items.map((it) => toId(it.product_id)), 'id name sku unit');
  if (items.some((it) => !products.has(toId(it.product_id)))) {
    return res.status(400).json({ error: 'One or more selected products do not exist' });
  }

  // No advance collection at creation: received = 0, pending = full amount, UNPAID
  const id = await Order.nextId();
  const orderNumber = `ORD-${10180 + id}`;
  const salesPersonId = user.role_slug === 'sales_person' ? user.id : vendor.assigned_sales_person_id || user.id;

  await Order.insert({
    id,
    order_number: orderNumber,
    company_id: toId(company_id),
    vendor_id: vendor.id,
    sales_person_id: salesPersonId,
    transportName: transportName || null,
    transportAddress: transportAddress || null,
    booking_station: booking_station || null,
    transport_contact_number: transport_contact_number || null,
    order_status: 'NEW',
    production_status: 'NOT_ASSIGNED',
    packing_status: 'PENDING_PACKING',
    dispatch_status: 'NOT_DISPATCHED',
    delivery_status: 'PENDING',
    payment_status: 'UNPAID',
    payment_terms: payment_terms || 'Advance',
    tax_type: totals.isNonGst ? 'NON_GST' : 'GST_18',
    subtotal: totals.subtotal,
    gross_amount: totals.grossAmount,
    discount_type: totals.discountType,
    discount_value: totals.discountValue,
    discount_amount: totals.discountAmount,
    tax_rate: totals.taxRate,
    tax_amount: totals.taxAmount,
    grand_total: totals.grandTotal,
    amount_received: 0,
    pending_amount: totals.grandTotal,
    required_delivery_date: required_delivery_date || null,
    delivery_address: delivery_address || vendor.delivery_address || vendor.billing_address,
    delivery_contact_person: delivery_contact_person || vendor.contact_person,
    delivery_contact_number: delivery_contact_number || vendor.mobile,
    special_instructions: special_instructions || null,
    notes: notes || null,
    created_by_id: user.id,
  });

  for (const it of items) {
    const prod = products.get(toId(it.product_id));
    await OrderItem.insert({
      order_id: id,
      product_id: prod.id,
      sku: prod.sku,
      product_name: prod.name,
      unit: prod.unit,
      quantity: Number(it.quantity),
      rate: Number(it.rate),
      line_amount: Number(it.quantity) * Number(it.rate),
      notes: it.notes || null,
      item_colour: (it.item_colour && String(it.item_colour).trim()) || prod.item_colour || '',
      item_availability: 'AVAILABLE',
    });
  }

  await addHistory(id, 'Order Created', null, 'NEW', `Order submitted by ${user.name} (Awaiting client payment & Admin review)`, user.id);
  await logActivity(user.id, 'ORDER_CREATED', 'order', orderNumber, `${user.name} created order ${orderNumber} for ${vendor.company_name} (Total: ₹${inr(totals.grandTotal)})`);
  await sendNotification(null, 'admin', 'New Order Requires Review', `Order ${orderNumber} submitted by ${user.name} for ${vendor.company_name}`, 'warning', id);

  // Party chose to adjust saved credit against this order
  let creditApplied = 0;
  if (use_credit) {
    const created = await Order.row({ id });
    const r = await applyCreditToOrder(created, user);
    if (!r.error) creditApplied = r.applied;
  }

  res.json({
    order_id: id, order_number: orderNumber, credit_applied: creditApplied,
    message: creditApplied > 0
      ? `Order created. ₹${inr(creditApplied)} adjusted from party credit. Submitted for Admin review!`
      : 'Order created successfully and submitted for Admin review!',
  });
};

// ---------------------------------------------------------------------------
// PUT /api/orders/:id  ( edit - same order id, no duplicate )
// ---------------------------------------------------------------------------
exports.update = async (req, res) => {
  const user = req.user;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const id = order.id;

  const isAdmin = ['super_admin', 'admin'].includes(user.role_slug) || user.permissions.includes('orders:edit_all');
  const hasEditPerm = isAdmin || user.permissions.includes('orders:edit');

  if (order.order_status === 'CANCELLED') {
    return res.status(400).json({ error: 'Cancelled orders cannot be edited.' });
  }

  // - New: own Sales Person or Admin
  // - Approved: needs edit permission
  // - Packing started / Delivered: Admin only
  if (order.order_status === 'DELIVERED') {
    if (!isAdmin) return res.status(403).json({ error: 'Access denied: Only Administrators can modify delivered orders.' });
  } else if (order.order_status === 'PROCESSING' || ['IN_PROGRESS', 'PACKED', 'PACKING_IN_PROGRESS'].includes(order.packing_status)) {
    if (!isAdmin) return res.status(403).json({ error: 'Access denied: Packing has already started. Only Administrators can adjust commercial or product details.' });
  } else if (order.order_status === 'ACCEPTED') {
    if (!hasEditPerm) return res.status(403).json({ error: 'Access denied: Editing an approved order requires Admin authorization.' });
  } else if (order.order_status === 'NEW') {
    if (user.role_slug === 'sales_person' && order.sales_person_id !== user.id) {
      return res.status(403).json({ error: 'Access denied: You can only edit your own orders.' });
    }
    if (!hasEditPerm && user.role_slug !== 'sales_person') {
      return res.status(403).json({ error: 'Access denied: You do not have permission to edit orders.' });
    }
  }

  const {
    transportAddress, booking_station, transport_contact_number, company_id, vendor_id, items, tax_type = order.tax_type || 'GST_18', notes, delivery_address, transportName,
    delivery_contact_person, delivery_contact_number, required_delivery_date, special_instructions, payment_terms,
    discount_type = order.discount_type || 'NONE', discount_value = order.discount_value || 0,
  } = req.body;

  const targetCompanyId = company_id ? Number(company_id) : order.company_id;
  const targetVendorId = vendor_id ? Number(vendor_id) : order.vendor_id;
  if (targetVendorId !== order.vendor_id) {
    const newParty = await Vendor.row({ id: targetVendorId });
    if (!newParty) return res.status(404).json({ error: 'Selected party does not exist' });
    if (newParty.status === 'inactive') {
      return res.status(400).json({ error: 'This party is inactive. Activate the party before using it on an order.' });
    }
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one product item is required.' });
  }
  const totals = computeTotals(items, tax_type, discount_type, discount_value);
  if (totals.error) return res.status(400).json({ error: totals.error });

  // pending = grand total - verified received
  const amountReceived = Number(order.amount_received || 0);
  const pendingAmount = Math.max(0, round2(totals.grandTotal - amountReceived));

  let newPaymentStatus = 'UNPAID';
  if (amountReceived >= totals.grandTotal && totals.grandTotal > 0) newPaymentStatus = 'FULLY_PAID';
  else if (amountReceived > 0) newPaymentStatus = 'PARTIALLY_PAID';

  const trimOrNull = (v) => (v ? String(v).trim() : null);

  await Order.updateOne(
    { id },
    {
      $set: {
        company_id: targetCompanyId,
        vendor_id: targetVendorId,
        tax_type: totals.isNonGst ? 'NON_GST' : 'GST_18',
        subtotal: totals.subtotal,
        gross_amount: totals.grossAmount,
        discount_type: totals.discountType,
        discount_value: totals.discountValue,
        discount_amount: totals.discountAmount,
        tax_rate: totals.taxRate,
        tax_amount: totals.taxAmount,
        grand_total: totals.grandTotal,
        pending_amount: pendingAmount,

        payment_status: newPaymentStatus,
        notes: notes !== undefined ? trimOrNull(notes) : order.notes,
        delivery_address: delivery_address !== undefined ? trimOrNull(delivery_address) : order.delivery_address,
        delivery_contact_person: delivery_contact_person !== undefined ? trimOrNull(delivery_contact_person) : order.delivery_contact_person,
        delivery_contact_number: delivery_contact_number !== undefined ? trimOrNull(delivery_contact_number) : order.delivery_contact_number,
        required_delivery_date: required_delivery_date !== undefined ? required_delivery_date || null : order.required_delivery_date,
        special_instructions: special_instructions !== undefined ? trimOrNull(special_instructions) : order.special_instructions,
        transportName: transportName !== undefined ? trimOrNull(transportName) : order.transportName,
        transportAddress: transportAddress !== undefined ? trimOrNull(transportAddress) : order.transportAddress,
        booking_station: booking_station !== undefined ? trimOrNull(booking_station) : order.booking_station,
        transport_contact_number: transport_contact_number !== undefined ? trimOrNull(transport_contact_number) : order.transport_contact_number,
        payment_terms: payment_terms !== undefined ? payment_terms || 'Advance' : order.payment_terms,
        updated_by_id: user.id,
        updated_at: nowStr(),
      },
    }
  );

  // Replace order items
  const products = await Product.byIds(items.map((it) => toId(it.product_id)), 'id name sku unit item_colour');
  await OrderItem.deleteMany({ order_id: id });
  // records that pointed at the replaced line items go with them
  await Promise.all([
    ProductionRecord.deleteMany({ order_id: id }),
    Dispatch.updateMany({ order_id: id }, { $set: { items: [] } }),
    Delivery.updateMany({ order_id: id }, { $set: { items: [] } }),
  ]);
  for (const it of items) {
    const prod = products.get(toId(it.product_id));
    await OrderItem.insert({
      order_id: id,
      product_id: Number(it.product_id),
      sku: prod?.sku || it.sku || 'SKU',
      product_name: prod?.name || it.product_name || 'Product',
      unit: prod?.unit || it.unit || 'Ltr',
      quantity: Number(it.quantity),
      rate: Number(it.rate),
      line_amount: round2(Number(it.quantity) * Number(it.rate)),
      notes: it.notes || null,
      item_colour: it.item_colour || prod?.item_colour || '',
      item_availability: 'AVAILABLE',
    });
  }

  await addHistory(id, 'Order Updated', order.order_status, order.order_status, `Order details updated by ${user.name}`, user.id);
  await logActivity(user.id, 'ORDER_UPDATED', 'order', order.order_number, `${user.name} updated order ${order.order_number} (New Total: ₹${inr(totals.grandTotal)})`);

  const [updatedOrder, updatedItems] = await Promise.all([
    Order.row({ id }),
    OrderItem.rows({ order_id: id }, { sort: { id: 1 } }),
  ]);
  res.json({ order: updatedOrder, items: updatedItems, message: 'Order updated successfully.' });
};

// ---------------------------------------------------------------------------
// ADMIN ACTIONS: ACCEPT, CANCEL, ASSIGN, COMPLETE
// ---------------------------------------------------------------------------
exports.accept = async (req, res) => {
  const user = req.user;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.order_status !== 'NEW') {
    return res.status(400).json({ error: `Cannot accept order in status ${order.order_status}` });
  }

  await Order.updateOne({ id: order.id }, { $set: { order_status: 'ACCEPTED', updated_at: nowStr() } });
  await addHistory(order.id, 'Order Accepted', 'NEW', 'ACCEPTED', `Approved by ${user.name}. Ready for production assignment.`, user.id);
  await logActivity(user.id, 'ORDER_ACCEPTED', 'order', order.order_number, `${user.name} accepted order ${order.order_number}`);
  await sendNotification(order.sales_person_id, null, 'Order Approved', `Your order ${order.order_number} has been approved by Admin`, 'success', order.id);

  res.json({ message: 'Order approved successfully' });
};

exports.cancel = async (req, res) => {
  const user = req.user;
  const { reason } = req.body;
  if (!reason || String(reason).trim().length < 5) {
    return res.status(400).json({ error: 'A valid cancellation reason (min 5 characters) is required' });
  }

  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['COMPLETED', 'CANCELLED'].includes(order.order_status)) {
    return res.status(400).json({ error: `Cannot cancel an order that is already ${order.order_status}` });
  }

  const now = nowStr();
  await Order.updateOne(
    { id: order.id },
    { $set: { order_status: 'CANCELLED', cancellation_reason: String(reason).trim(), cancelled_by_id: user.id, cancelled_at: now, updated_at: now } }
  );
  await addHistory(order.id, 'Order Cancelled', order.order_status, 'CANCELLED', `Cancelled by ${user.name}. Reason: ${reason}`, user.id);
  await logActivity(user.id, 'ORDER_CANCELLED', 'order', order.order_number, `${user.name} cancelled order ${order.order_number}. Reason: ${reason}`);
  await sendNotification(order.sales_person_id, null, 'Order Cancelled', `Order ${order.order_number} was cancelled. Reason: ${reason}`, 'error', order.id);

  res.json({ message: 'Order has been cancelled' });
};

// DELETE /api/orders/:id  - permanently removes an order and everything attached to it.
// Only NEW or CANCELLED orders, and only when no payment was recorded (money records must never vanish).
exports.remove = async (req, res) => {
  const user = req.user;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (!['NEW', 'CANCELLED'].includes(order.order_status)) {
    return res.status(400).json({
      error: `Order ${order.order_number} is ${order.order_status}. Cancel it first - only New or Cancelled orders can be deleted.`,
    });
  }
  const payments = await Payment.countDocuments({ order_id: order.id });
  if (payments > 0) {
    return res.status(400).json({
      error: `Order ${order.order_number} has ${payments} payment record(s). Payments must be kept, so this order cannot be deleted.`,
    });
  }

  const oid = order.id;
  await Promise.all([
    OrderItem.deleteMany({ order_id: oid }),
    OrderStatusHistory.deleteMany({ order_id: oid }),
    ProductionRecord.deleteMany({ order_id: oid }),
    Dispatch.deleteMany({ order_id: oid }),
    Delivery.deleteMany({ order_id: oid }),
    Notification.deleteMany({ order_id: oid }),
  ]);
  await Order.deleteOne({ id: oid });

  await logActivity(user.id, 'ORDER_DELETED', 'order', order.order_number, `${user.name} deleted order ${order.order_number} (${order.order_status})`);
  res.json({ message: `Order ${order.order_number} deleted` });
};

exports.assignProduction = async (req, res) => {
  const user = req.user;
  const { notes } = req.body;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['ACCEPTED', 'NEW'].includes(order.order_status)) {
    return res.status(400).json({ error: `Order is already in ${order.order_status} stage` });
  }

  const now = nowStr();
  await Order.updateOne(
    { id: order.id },
    { $set: { order_status: 'PROCESSING', production_status: 'ASSIGNED', assigned_to_production_at: now, updated_at: now } }
  );
  await addHistory(order.id, 'Assigned to Production', order.order_status, 'PROCESSING', notes || 'Assigned to manufacturing floor for batching', user.id);
  await logActivity(user.id, 'ORDER_ASSIGNED_PROD', 'order', order.order_number, `${user.name} assigned order ${order.order_number} to production`);
  await sendNotification(null, 'production_team', 'New Production Assignment', `Order ${order.order_number} has been assigned for plant formulation`, 'info', order.id);

  res.json({ message: 'Order successfully assigned to Production' });
};

// Strict rule: an order can ONLY be completed when Delivered AND Fully Paid
exports.complete = async (req, res) => {
  const user = req.user;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.order_status === 'COMPLETED') return res.status(400).json({ error: 'Order is already marked Completed' });
  if (order.order_status === 'CANCELLED') return res.status(400).json({ error: 'Cannot complete a cancelled order' });

  if (order.delivery_status !== 'DELIVERED') {
    return res.status(400).json({
      error: `Strict Rule Violation: Order cannot be completed because goods have not been fully delivered yet. Current delivery status: ${order.delivery_status}.`,
    });
  }
  if (order.payment_status !== 'FULLY_PAID' || order.pending_amount > 0) {
    return res.status(400).json({
      error: `Strict Rule Violation: Order cannot be completed because payment is outstanding. Pending balance: ₹${inr(order.pending_amount)}. Please settle and verify payment before completion.`,
    });
  }

  const now = nowStr();
  await Order.updateOne(
    { id: order.id },
    { $set: { order_status: 'COMPLETED', completed_at: now, completed_by_id: user.id, updated_at: now } }
  );
  await addHistory(order.id, 'Order Closed & Completed', 'DELIVERED', 'COMPLETED', `Final closure authorized by ${user.name}. Verified full physical delivery & 100% financial settlement.`, user.id);
  await logActivity(user.id, 'ORDER_COMPLETED', 'order', order.order_number, `${user.name} closed order ${order.order_number} as 100% completed`);
  await sendNotification(order.sales_person_id, null, 'Order Completed', `Order ${order.order_number} has been closed as COMPLETED!`, 'success', order.id);

  res.json({ message: 'Order closed and marked COMPLETED successfully!' });
};

exports.findOrder = findOrder;