// Dispatch & Delivery
const { Order, OrderItem, Vendor, User, Dispatch, Delivery } = require('../models');
const { logActivity, sendNotification, addHistory } = require('../utils/audit');
const { toId, like, nowStr, addDateRange, sumBy, uniq, groupBy } = require('../utils/helpers');
const {
  loadOrderRefs, loadItemsByOrder, loadProductsFor, resolveIdsByIdOrName, idsMatching, isActive,
} = require('../utils/queries');
const { findOrder } = require('./order.controller');
const { filterOptionLists } = require('./packing.controller');

// GET /api/dispatch/orders
exports.listOrders = async (req, res) => {
  const user = req.user;
  const canViewDispatch =
    user.role_slug === 'super_admin' || user.permissions.includes('dispatch:view') ||
    user.role_slug === 'admin';
  if (!canViewDispatch) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access Dispatch & Delivery' });
  }

  const { date_type, startDate, endDate, date_from, date_to, status, sales_person_id, vendor_id, search } = req.query;
  const sDate = startDate || date_from;
  const eDate = endDate || date_to;

  const and = [
    { order_status: { $in: ['READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PROCESSING'] } },
    { $or: [{ production_status: 'PRODUCTION_COMPLETED' }, { dispatch_status: { $ne: 'NOT_DISPATCHED' } }] },
  ];
  if (user.role_slug === 'sales_person') and.push({ sales_person_id: user.id });

  if (sDate || eDate) {
    if (date_type === 'dispatch_date') {
      const rows = await Dispatch.rows(addDateRange({}, 'dispatch_date', sDate, eDate), { select: 'order_id' });
      and.push({ id: { $in: uniq(rows.map((r) => r.order_id)) } });
    } else if (date_type === 'delivery_date') {
      const rows = await Delivery.rows(addDateRange({}, 'delivery_date', sDate, eDate), { select: 'order_id' });
      and.push({ id: { $in: uniq(rows.map((r) => r.order_id)) } });
    } else {
      and.push(addDateRange({}, 'created_at', sDate, eDate));
    }
  }

  if (isActive(sales_person_id)) {
    and.push({ sales_person_id: { $in: await resolveIdsByIdOrName(User, 'name', sales_person_id) } });
  }
  if (isActive(vendor_id)) {
    and.push({ vendor_id: { $in: await resolveIdsByIdOrName(Vendor, 'company_name', vendor_id) } });
  }
  if (search) {
    and.push({
      $or: [{ order_number: like(search) }, { vendor_id: { $in: await idsMatching(Vendor, ['company_name'], search) } }],
    });
  }
  if (isActive(status)) and.push({ order_status: String(status) });

  const rows = await Order.rows({ $and: and });
  const rank = (o) => (o.order_status === 'READY_FOR_DISPATCH' ? 1 : o.order_status === 'OUT_FOR_DELIVERY' ? 2 : 3);
  rows.sort((a, b) => rank(a) - rank(b) || b.id - a.id);

  const ids = rows.map((o) => o.id);
  const [refs, itemsMap, dispatches, deliveries] = await Promise.all([
    loadOrderRefs(rows, { companies: false }),
    loadItemsByOrder(ids),
    ids.length ? Dispatch.rows({ order_id: { $in: ids } }, { select: 'id order_id dispatch_date', sort: { id: -1 } }) : [],
    ids.length ? Delivery.rows({ order_id: { $in: ids } }, { select: 'id order_id delivery_date', sort: { id: -1 } }) : [],
  ]);
  const products = await loadProductsFor([...itemsMap.values()].flat(), { withBrand: true });
  const lastDispatch = groupBy(dispatches, (d) => d.order_id);
  const lastDelivery = groupBy(deliveries, (d) => d.order_id);

  const orders = rows.map((o) => {
    const items = itemsMap.get(o.id) || [];
    const total = (f) => (items.length ? sumBy(items, (i) => i[f]) : null);
    return {
      id: o.id, order_number: o.order_number, order_status: o.order_status, dispatch_status: o.dispatch_status,
      delivery_status: o.delivery_status, required_delivery_date: o.required_delivery_date,
      delivery_address: o.delivery_address, delivery_contact_person: o.delivery_contact_person,
      delivery_contact_number: o.delivery_contact_number, payment_status: o.payment_status,
      grand_total: o.grand_total, amount_received: o.amount_received, pending_amount: o.pending_amount, created_at: o.created_at,
      vendor_name: refs.vendors.get(o.vendor_id)?.company_name ?? null,
      vendor_city: refs.vendors.get(o.vendor_id)?.city ?? null,
      sales_person_name: refs.users.get(o.sales_person_id)?.name ?? null,
      item_count: items.length,
      total_qty: total('quantity'),
      total_produced: total('produced_quantity'),
      total_dispatched: total('dispatched_quantity'),
      total_delivered: total('delivered_quantity'),
      last_dispatch_date: lastDispatch.get(o.id)?.[0]?.dispatch_date ?? null,
      last_delivery_date: lastDelivery.get(o.id)?.[0]?.delivery_date ?? null,
      items: items.map((i) => {
        const p = products.get(i.product_id);
        return {
          id: i.id, product_id: i.product_id, product_name: i.product_name, sku: i.sku, unit: i.unit, quantity: i.quantity,
          produced_quantity: i.produced_quantity, dispatched_quantity: i.dispatched_quantity, delivered_quantity: i.delivered_quantity,
          product_image: p?.image_url ?? null, brand_name: p?.brand_name ?? null,
        };
      }),
    };
  });

  const lists = await filterOptionLists(['READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PROCESSING']);
  res.json({ orders, ...lists });
};

// Picks requested lines ( or everything remaining ) and validates against available qty
function pickLines(orderItems, requested, availableOf, overflowMessage) {
  const itemMap = new Map(orderItems.map((it) => [it.id, it]));
  const lines = [];
  let total = 0;

  if (requested && Array.isArray(requested) && requested.length > 0) {
    for (const r of requested) {
      const dbIt = itemMap.get(Number(r.item_id));
      if (!dbIt) continue;
      const q = Number(r.quantity) || 0;
      if (q > 0) {
        const available = availableOf(dbIt);
        if (q > available) return { error: overflowMessage(q, available, dbIt) };
        lines.push({ order_item_id: dbIt.id, quantity: q });
        total += q;
      }
    }
  } else {
    for (const dbIt of orderItems) {
      const remaining = availableOf(dbIt);
      if (remaining > 0) {
        lines.push({ order_item_id: dbIt.id, quantity: remaining });
        total += remaining;
      }
    }
  }
  return { lines, total };
}

// POST /api/orders/:id/create-dispatch
exports.createDispatch = async (req, res) => {
  const user = req.user;
  const {
    transport_name, transport_contact, vehicle_number, lr_number, tracking_number,
    driver_name, driver_mobile, dispatch_date, notes, items,
  } = req.body;

  if (!transport_name || !vehicle_number) {
    return res.status(400).json({ error: 'Transport Name and Vehicle Number are required' });
  }

  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const orderItems = await OrderItem.rows({ order_id: order.id });

  const picked = pickLines(
    orderItems, items,
    (it) => it.produced_quantity - it.dispatched_quantity,
    (q, available, it) => `Dispatch quantity (${q}) exceeds available produced stock (${available}) for ${it.product_name}`
  );
  if (picked.error) return res.status(400).json({ error: picked.error });
  if (picked.total <= 0) {
    return res.status(400).json({ error: 'No items available to dispatch or quantity is 0' });
  }

  const dispatchId = await Dispatch.nextId();
  const dispatchNum = `DSP-${8000 + dispatchId}`;

  await Dispatch.insert({
    id: dispatchId,
    dispatch_number: dispatchNum,
    order_id: order.id,
    dispatch_date: dispatch_date || new Date().toISOString().slice(0, 10),
    transport_name,
    transport_contact: transport_contact || null,
    vehicle_number,
    lr_number: lr_number || null,
    tracking_number: tracking_number || null,
    driver_name: driver_name || null,
    driver_mobile: driver_mobile || null,
    dispatch_quantity: picked.total,
    notes: notes || null,
    items: picked.lines,
    created_by_id: user.id,
  });

  for (const line of picked.lines) {
    await OrderItem.updateOne({ id: line.order_item_id }, { $inc: { dispatched_quantity: line.quantity } });
  }

  const fresh = await OrderItem.rows({ order_id: order.id }, { select: 'quantity dispatched_quantity' });
  const isFullDispatch = sumBy(fresh, (i) => i.dispatched_quantity) >= sumBy(fresh, (i) => i.quantity);
  const nextDispStatus = isFullDispatch ? 'FULLY_DISPATCHED' : 'PARTIALLY_DISPATCHED';

  const now = nowStr();
  await Order.updateOne(
    { id: order.id },
    { $set: { dispatch_status: nextDispStatus, order_status: 'OUT_FOR_DELIVERY', delivery_status: 'OUT_FOR_DELIVERY', dispatched_at: now, updated_at: now } }
  );
  await addHistory(order.id, 'Order Dispatched', order.dispatch_status, 'OUT_FOR_DELIVERY', `Dispatched via ${transport_name} (${vehicle_number}) LR #${lr_number || 'N/A'}. Qty: ${picked.total}`, user.id);
  await logActivity(user.id, 'ORDER_DISPATCHED', 'order', order.order_number, `${user.name} created dispatch ${dispatchNum} for ${order.order_number} (${vehicle_number})`);
  await sendNotification(order.sales_person_id, null, 'Order Dispatched', `Order ${order.order_number} has been dispatched via ${transport_name} (${vehicle_number})`, 'info', order.id);

  res.json({
    message: `Dispatch ${dispatchNum} created successfully. Order is Out for Delivery.`,
    dispatch_number: dispatchNum,
    dispatch_status: nextDispStatus,
  });
};

// POST /api/orders/:id/update-delivery
exports.updateDelivery = async (req, res) => {
  const user = req.user;
  const { dispatch_id, delivery_date, received_by, receiver_mobile, notes, items } = req.body;

  if (!received_by) {
    return res.status(400).json({ error: 'Receiver name / acknowledgement is required' });
  }

  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const orderItems = await OrderItem.rows({ order_id: order.id });

  const picked = pickLines(
    orderItems, items,
    (it) => it.dispatched_quantity - it.delivered_quantity,
    (q, available, it) => `Delivered quantity (${q}) cannot exceed pending in-transit quantity (${available}) for ${it.product_name}`
  );
  if (picked.error) return res.status(400).json({ error: picked.error });
  if (picked.total <= 0) {
    return res.status(400).json({ error: 'No items remaining to deliver or quantity is 0' });
  }

  await Delivery.insert({
    order_id: order.id,
    dispatch_id: toId(dispatch_id),
    delivery_date: delivery_date || new Date().toISOString().slice(0, 10),
    delivered_quantity: picked.total,
    received_by,
    receiver_mobile: receiver_mobile || null,
    notes: notes || null,
    items: picked.lines,
    created_by_id: user.id,
  });

  for (const line of picked.lines) {
    await OrderItem.updateOne({ id: line.order_item_id }, { $inc: { delivered_quantity: line.quantity } });
  }

  const fresh = await OrderItem.rows({ order_id: order.id }, { select: 'quantity delivered_quantity' });
  const isFullDelivery = sumBy(fresh, (i) => i.delivered_quantity) >= sumBy(fresh, (i) => i.quantity);
  const nextDeliveryStatus = isFullDelivery ? 'DELIVERED' : 'PARTIALLY_DELIVERED';
  const nextOrderStatus = isFullDelivery ? 'DELIVERED' : order.order_status;

  const now = nowStr();
  await Order.updateOne(
    { id: order.id },
    {
      $set: {
        delivery_status: nextDeliveryStatus,
        order_status: nextOrderStatus,
        ...(isFullDelivery ? { delivered_at: now } : {}),
        updated_at: now,
      },
    }
  );
  await addHistory(order.id, 'Delivery Recorded', order.delivery_status, nextDeliveryStatus, `Received by ${received_by} (${receiver_mobile || 'No contact'}). Qty: ${picked.total}`, user.id);
  await logActivity(user.id, 'DELIVERY_RECORDED', 'order', order.order_number, `${user.name} recorded delivery of ${picked.total} units for ${order.order_number}`);
  await sendNotification(order.sales_person_id, null, 'Order Delivered', `Order ${order.order_number} has been received by ${received_by}`, 'success', order.id);

  res.json({
    message: isFullDelivery
      ? 'Order fully delivered! Note: Order will remain open until payment is verified.'
      : 'Partial delivery recorded successfully.',
    delivery_status: nextDeliveryStatus,
    order_status: nextOrderStatus,
  });
};
