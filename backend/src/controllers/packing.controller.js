// Packing Management: check availability -> pack -> deliver ( or hand over to dispatch )
const { Order, OrderItem, Vendor, User, Role, Delivery } = require('../models');
const { logActivity, sendNotification, addHistory } = require('../utils/audit');
const { toId, like, nowStr, round2, inr, addDateRange, sumBy, uniq } = require('../utils/helpers');
const {
  loadOrderRefs, loadItemsByOrder, loadProductsFor, resolveIdsByIdOrName, idsMatching, isActive,
} = require('../utils/queries');
const { findOrder } = require('./order.controller');
const { recalcOrderLedger } = require('./payment.controller');

// Sets produced / dispatched / delivered quantity = ordered quantity for every line
async function fillItemQuantities(orderId, fields) {
  const items = await OrderItem.rows({ order_id: orderId }, { select: 'id quantity' });
  if (!items.length) return;
  await OrderItem.bulkWrite(
    items.map((it) => ({
      updateOne: {
        filter: { id: it.id },
        update: { $set: Object.fromEntries(fields.map((f) => [f, it.quantity])) },
      },
    }))
  );
}

async function markDelivered(order, user) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('en-IN', { hour12: true });
  const stamp = nowStr(now);

  await Order.updateOne(
    { id: order.id },
    {
      $set: {
        order_status: 'DELIVERED', delivery_status: 'DELIVERED', packing_status: 'PACKED',
        delivered_at: stamp, delivered_by_id: user.id, delivered_by_name: user.name, updated_at: stamp,
      },
    }
  );
  await addHistory(order.id, 'Order Delivered', order.order_status, 'DELIVERED', `Order Delivered by ${user.name} on ${dateStr} at ${timeStr}`, user.id);

  return {
    message: 'Order marked as Delivered successfully!',
    order_status: 'DELIVERED',
    delivered_by_name: user.name,
    delivered_at: `${dateStr} ${timeStr}`,
  };
}

// Sales persons having the role OR owning an order in the given statuses
async function filterOptionLists(statuses) {
  const [salesRole, activeOrders] = await Promise.all([
    Role.row({ slug: 'sales_person' }),
    Order.rows({ order_status: { $in: statuses } }, { select: 'sales_person_id vendor_id' }),
  ]);
  const [users, vendors] = await Promise.all([
    User.rows(
      { $or: [{ role_id: salesRole ? salesRole.id : -1 }, { id: { $in: uniq(activeOrders.map((o) => o.sales_person_id)) } }] },
      { select: 'id name', sort: { name: 1 } }
    ),
    Vendor.rows(
      { $or: [{ status: 'active' }, { id: { $in: uniq(activeOrders.map((o) => o.vendor_id)) } }] },
      { select: 'id company_name', sort: { company_name: 1 } }
    ),
  ]);
  return {
    salesPersons: users.map((u) => ({ id: u.id, name: u.name })),
    vendors: vendors.map((v) => ({ id: v.id, name: v.company_name })),
  };
}

// GET /api/packing/orders  ( also /api/production/orders )
exports.listOrders = async (req, res) => {
  const user = req.user;
  const canViewPacking =
    user.role_slug === 'super_admin' || user.permissions.includes('packing:view') ||
    user.permissions.includes('production:view') || user.role_slug === 'admin' || user.role_slug === 'production_team';
  if (!canViewPacking) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to access Packing Management' });
  }

  const { sales_person_id, vendor_id, startDate, endDate, date_from, date_to, search } = req.query;
  const sDate = startDate || date_from;
  const eDate = endDate || date_to;

  const and = [{ order_status: { $in: ['ACCEPTED', 'PROCESSING', 'ON_HOLD', 'NEW', 'DELIVERED', 'READY_FOR_DISPATCH'] } }];
  if (user.role_slug === 'sales_person') and.push({ sales_person_id: user.id });
  if (sDate || eDate) and.push(addDateRange({}, 'created_at', sDate, eDate));
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

  const rows = await Order.rows({ $and: and });

  const rank = (o) => {
    if (o.packing_status === 'PENDING_PACKING' || o.production_status === 'ASSIGNED') return 1;
    if (o.packing_status === 'PACKING_IN_PROGRESS' || o.production_status === 'IN_PRODUCTION') return 2;
    if (o.packing_status === 'PACKED' || o.production_status === 'PRODUCTION_COMPLETED') return 3;
    if (o.packing_status === 'ON_HOLD') return 4;
    if (o.order_status === 'DELIVERED') return 5;
    return 6;
  };
  rows.sort((a, b) => rank(a) - rank(b) || b.id - a.id);

  const displayPackingStatus = (o) => {
    if (o.order_status === 'DELIVERED' || o.delivery_status === 'DELIVERED') return 'DELIVERED';
    if (['HANDED_OVER_TO_DISPATCH', 'HANDED_OVER'].includes(o.packing_status)) return 'PACKED';
    if (o.packing_status != null) return o.packing_status;
    if (o.production_status === 'PRODUCTION_COMPLETED') return 'PACKED';
    if (o.production_status === 'IN_PRODUCTION') return 'PACKING_IN_PROGRESS';
    return 'PENDING_PACKING';
  };

  const [refs, itemsMap] = await Promise.all([
    loadOrderRefs(rows, { companies: false }),
    loadItemsByOrder(rows.map((o) => o.id)),
  ]);
  const products = await loadProductsFor([...itemsMap.values()].flat(), { withBrand: true });

  const orders = rows.map((o) => {
    const items = itemsMap.get(o.id) || [];
    return {
      id: o.id, order_number: o.order_number, order_status: o.order_status, production_status: o.production_status,
      vendor_id: o.vendor_id, sales_person_id: o.sales_person_id,
      packing_status: displayPackingStatus(o),
      packing_notes: o.packing_notes, delivery_status: o.delivery_status,
      delivery_address: o.delivery_address, delivery_contact_person: o.delivery_contact_person,
      delivery_contact_number: o.delivery_contact_number, special_instructions: o.special_instructions,
      transportName: o.transportName, transportAddress: o.transportAddress,
      booking_station: o.booking_station, transport_contact_number: o.transport_contact_number,
      required_delivery_date: o.required_delivery_date, created_at: o.created_at, delivered_at: o.delivered_at,
      delivered_by_name: o.delivered_by_name, grand_total: o.grand_total,
      vendor_name: refs.vendors.get(o.vendor_id)?.company_name ?? null,
      vendor_city: refs.vendors.get(o.vendor_id)?.city ?? null,
      sales_person_name: refs.users.get(o.sales_person_id)?.name ?? null,
      item_count: items.length,
      total_qty: items.length ? sumBy(items, (i) => i.quantity) : null,
      items: items.map((i) => {
        const p = products.get(i.product_id);
        return {
          id: i.id, product_id: i.product_id, sku: i.sku, product_name: i.product_name, unit: i.unit, quantity: i.quantity,
          delivered_quantity: i.delivered_quantity || 0, rate: i.rate,
          item_availability: i.item_availability ?? 'AVAILABLE',
          product_image: p?.image_url ?? null, item_colour: p?.item_colour ?? null,
          brand_name: p?.brand_name ?? null, category_name: p?.category_name ?? null,
        };
      }),
    };
  });

  const lists = await filterOptionLists(['ACCEPTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'NEW', 'ON_HOLD']);
  res.json({ orders, ...lists });
};

// Action 1: Toggle item availability ( Item Ready / Not Available )
exports.toggleItemAvailability = async (req, res) => {
  const user = req.user;
  const { item_id, availability, hold_reason } = req.body;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const statusVal = availability === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' : 'AVAILABLE';
  await OrderItem.updateOne({ id: toId(item_id), order_id: order.id }, { $set: { item_availability: statusVal } });

  if (statusVal === 'NOT_AVAILABLE') {
    await Order.updateOne(
      { id: order.id },
      { $set: { packing_status: 'ON_HOLD', packing_notes: hold_reason || 'Item shortage reported during packing check', updated_at: nowStr() } }
    );
    await addHistory(order.id, 'Packing On Hold', order.packing_status || 'PENDING_PACKING', 'ON_HOLD', `Item shortage: ${hold_reason || 'Reported not available by packing team'}. Admin notified.`, user.id);
    await logActivity(user.id, 'PACKING_ON_HOLD', 'order', order.order_number, `${user.name} marked ${order.order_number} ON HOLD due to item unavailability`);
    await sendNotification(null, 'admin', 'Packing Order On Hold', `Order ${order.order_number} put on hold due to missing item stock`, 'warning', order.id);

    return res.json({ message: 'Item marked Not Available. Order is now ON HOLD and Admin has been notified.', packing_status: 'ON_HOLD' });
  }

  const notAvailCount = await OrderItem.countDocuments({ order_id: order.id, item_availability: 'NOT_AVAILABLE' });
  if (notAvailCount === 0 && order.packing_status === 'ON_HOLD') {
    await Order.updateOne({ id: order.id }, { $set: { packing_status: 'PENDING_PACKING', packing_notes: null } });
  }
  return res.json({ message: 'Item marked Available and ready for packing.' });
};

// Action 2: Start packing
exports.startPacking = async (req, res) => {
  const user = req.user;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  await Order.updateOne(
    { id: order.id },
    { $set: { packing_status: 'PACKING_IN_PROGRESS', order_status: 'PROCESSING', updated_at: nowStr() } }
  );
  await addHistory(order.id, 'Packing Started', order.packing_status || 'PENDING_PACKING', 'PACKING_IN_PROGRESS', `Packing team initiated picking and drum/carton packing (Logged by ${user.name})`, user.id);
  await logActivity(user.id, 'PACKING_STARTED', 'order', order.order_number, `${user.name} started packing order ${order.order_number}`);

  res.json({ message: 'Packing in progress', packing_status: 'PACKING_IN_PROGRESS' });
};

// Action 3: Complete packing
exports.completePacking = async (req, res) => {
  const user = req.user;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const notAvail = await OrderItem.countDocuments({ order_id: order.id, item_availability: 'NOT_AVAILABLE' });
  if (notAvail > 0) {
    return res.status(400).json({ error: 'Cannot complete packing while one or more items are marked Not Available.' });
  }

  await fillItemQuantities(order.id, ['produced_quantity']);
  await Order.updateOne(
    { id: order.id },
    { $set: { packing_status: 'PACKED', order_status: 'PROCESSING', updated_at: nowStr() } }
  );
  await addHistory(order.id, 'Packing Completed', order.packing_status || 'PACKING_IN_PROGRESS', 'PACKED', `All ordered items packed, labeled and verified by ${user.name}. Ready for DELIVER.`, user.id);
  await logActivity(user.id, 'PACKING_COMPLETED', 'order', order.order_number, `${user.name} completed packing for ${order.order_number}`);

  res.json({ message: 'Packing completed successfully! Status is Packed. Click DELIVER to mark Delivered.', packing_status: 'PACKED' });
};

// Action 4: Delivery ( Packed -> DELIVER -> full or partial shipment )
// body: { mode: 'FULL' | 'PARTIAL', items: [{ item_id, quantity }] }   ( items only for PARTIAL )
// Every delivery is one shipment and gets its own invoice for exactly the units sent.
exports.deliver = async (req, res) => {
  const user = req.user;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.order_status === 'DELIVERED') return res.status(400).json({ error: 'Order is already marked as Delivered' });
  if (order.order_status === 'CANCELLED') return res.status(400).json({ error: 'Cannot deliver a cancelled order' });

  const isAuthorized =
    ['super_admin', 'admin', 'packing_team', 'production_team', 'sales_person'].includes(user.role_slug) ||
    ['packing:deliver', 'orders:deliver', 'packing:manage', 'packing:view', 'orders:view_all', 'orders:approve'].some((p) =>
      user.permissions.includes(p)
    );
  if (!isAuthorized) {
    return res.status(403).json({ error: 'Access denied: You do not have permission to mark orders as Delivered' });
  }

  const mode = String(req.body?.mode || 'FULL').toUpperCase() === 'PARTIAL' ? 'PARTIAL' : 'FULL';
  const orderItems = await OrderItem.rows({ order_id: order.id }, { sort: { id: 1 } });
  const remainingOf = (it) => Math.max(0, it.quantity - (it.delivered_quantity || 0));
  const itemMap = new Map(orderItems.map((it) => [it.id, it]));

  // ---- which units go in this shipment ----
  const lines = [];
  if (mode === 'PARTIAL') {
    const requested = req.body?.items;
    if (!Array.isArray(requested) || !requested.length) {
      return res.status(400).json({ error: 'Enter how many units are being delivered for each item' });
    }
    for (const r of requested) {
      const it = itemMap.get(toId(r.item_id));
      if (!it) continue;
      const q = Number(r.quantity) || 0;
      if (q <= 0) continue;
      if (q > remainingOf(it)) {
        return res.status(400).json({ error: `Delivered quantity (${q}) exceeds remaining quantity (${remainingOf(it)}) for ${it.product_name}` });
      }
      lines.push({ it, quantity: q });
    }
  } else {
    for (const it of orderItems) if (remainingOf(it) > 0) lines.push({ it, quantity: remainingOf(it) });
  }
  if (!lines.length) return res.status(400).json({ error: 'No units to deliver. Enter a quantity above 0.' });

  const shipQty = sumBy(lines, (l) => l.quantity);
  const isFull = orderItems.every((it) => {
    const add = lines.find((l) => l.it.id === it.id)?.quantity || 0;
    return (it.delivered_quantity || 0) + add >= it.quantity;
  });

  // ---- invoice for THIS shipment only ( qty x rate, same GST split as the order ) ----
  const isNonGst = order.tax_type === 'NON_GST';
  const invoiceTotal = round2(sumBy(lines, (l) => round2(l.quantity * l.it.rate)));
  const subtotal = isNonGst ? invoiceTotal : round2(invoiceTotal / 1.18);
  const taxAmount = isNonGst ? 0 : round2(invoiceTotal - subtotal);
  const shipmentNo = (await Delivery.count({ order_id: order.id })) + 1;
  const invoiceNumber = `${String(order.order_number).replace('ORD-', 'INV-')}-${shipmentNo}`;
  const today = new Date().toISOString().slice(0, 10);

  await Delivery.insert({
    order_id: order.id,
    delivery_date: today,
    delivered_quantity: shipQty,
    received_by: user.name,
    notes: isFull ? (shipmentNo > 1 ? 'Final shipment' : 'Full delivery') : 'Partial delivery',
    items: lines.map((l) => ({ order_item_id: l.it.id, quantity: l.quantity })),
    shipment_no: shipmentNo,
    invoice_number: invoiceNumber,
    is_partial: isFull ? 0 : 1,
    tax_type: isNonGst ? 'NON_GST' : 'GST_18',
    subtotal, tax_amount: taxAmount, invoice_total: invoiceTotal,
    created_by_id: user.id,
  });

  await OrderItem.bulkWrite(
    lines.map((l) => ({
      updateOne: {
        filter: { id: l.it.id },
        update: {
          $inc: { dispatched_quantity: l.quantity, delivered_quantity: l.quantity },
          $set: { produced_quantity: Math.max(l.it.produced_quantity || 0, (l.it.delivered_quantity || 0) + l.quantity) },
        },
      },
    }))
  );

  let payload;
  if (isFull) {
    payload = await markDelivered(order, user);
    await Order.updateOne({ id: order.id }, { $set: { dispatch_status: 'FULLY_DISPATCHED', dispatched_at: nowStr() } });
  } else {
    const stamp = nowStr();
    await Order.updateOne(
      { id: order.id },
      { $set: { delivery_status: 'PARTIALLY_DELIVERED', dispatch_status: 'PARTIALLY_DISPATCHED', dispatched_at: stamp, updated_at: stamp } }
    );
    await addHistory(order.id, 'Partial Delivery', order.delivery_status, 'PARTIALLY_DELIVERED',
      `${shipQty} unit(s) delivered by ${user.name}. Invoice ${invoiceNumber} = ₹${inr(invoiceTotal)}. Remaining units will go in the next shipment.`, user.id);
    payload = { message: 'Partial delivery recorded. Remaining units stay open for the next shipment.', order_status: order.order_status };
  }

  const pendingUnits = sumBy(orderItems, (it) => remainingOf(it)) - shipQty;
  await logActivity(user.id, isFull ? 'ORDER_DELIVERED' : 'ORDER_PARTIALLY_DELIVERED', 'order', order.order_number,
    `${user.name} delivered ${shipQty} unit(s) of ${order.order_number} (${isFull ? 'complete' : 'partial'}), invoice ${invoiceNumber}`);
  await sendNotification(order.sales_person_id, null, isFull ? 'Order Delivered' : 'Order Partially Delivered',
    isFull ? `Order ${order.order_number} has been Delivered!` : `Order ${order.order_number}: ${shipQty} unit(s) delivered, ${pendingUnits} still pending`,
    isFull ? 'success' : 'info', order.id);
  await sendNotification(null, 'admin', isFull ? 'Order Delivered' : 'Order Partially Delivered',
    `Order ${order.order_number} ${isFull ? 'delivered' : 'partially delivered'} by ${user.name}`, 'info', order.id);

  res.json({
    ...payload,
    is_partial: !isFull,
    delivery_status: isFull ? 'DELIVERED' : 'PARTIALLY_DELIVERED',
    shipment_no: shipmentNo,
    invoice_number: invoiceNumber,
    invoice_total: invoiceTotal,
    delivered_units: shipQty,
    pending_units: Math.max(0, pendingUnits),
  });
};

// POST /api/orders/:id/close-short   { reason? }
// Partially delivered order: customer does not want the remaining units.
// Remaining units are cancelled, order total drops to what was delivered, order is closed as Delivered,
// and any cash received above the new total moves to the party's credit automatically.
exports.closeShort = async (req, res) => {
  const user = req.user;
  if (!['super_admin', 'admin', 'accounts'].includes(user.role_slug)) {
    return res.status(403).json({ error: 'Only Admin or Accounts can cancel the remaining units' });
  }
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['DELIVERED', 'CANCELLED', 'COMPLETED'].includes(order.order_status)) {
    return res.status(400).json({ error: 'This order is already closed' });
  }

  const items = await OrderItem.rows({ order_id: order.id }, { sort: { id: 1 } });
  const deliveredUnits = sumBy(items, (i) => i.delivered_quantity);
  const pendingUnits = sumBy(items, (i) => Math.max(0, i.quantity - (i.delivered_quantity || 0)));
  if (deliveredUnits <= 0) {
    return res.status(400).json({ error: 'Nothing delivered yet. Cancel the whole order instead.' });
  }
  if (pendingUnits <= 0) return res.status(400).json({ error: 'No remaining units to cancel' });

  // Shrink every line to what was actually delivered ( lines with 0 delivered are removed )
  const kept = items.filter((i) => (i.delivered_quantity || 0) > 0);
  await OrderItem.deleteMany({ order_id: order.id, id: { $nin: kept.map((i) => i.id) } });
  await OrderItem.bulkWrite(kept.map((i) => ({
    updateOne: {
      filter: { id: i.id },
      update: { $set: { quantity: i.delivered_quantity, line_amount: round2(i.delivered_quantity * i.rate), produced_quantity: i.delivered_quantity, dispatched_quantity: i.delivered_quantity } },
    },
  })));

  const isNonGst = order.tax_type === 'NON_GST';
  const grandTotal = round2(sumBy(kept, (i) => round2(i.delivered_quantity * i.rate)));
  const subtotal = isNonGst ? grandTotal : round2(grandTotal / 1.18);
  const oldTotal = order.grand_total;
  const reason = String(req.body?.reason || '').trim() || 'Customer did not want the remaining units';
  const stamp = nowStr();

  await Order.updateOne({ id: order.id }, { $set: {
    grand_total: grandTotal, subtotal, tax_amount: isNonGst ? 0 : round2(grandTotal - subtotal),
    order_status: 'DELIVERED', delivery_status: 'DELIVERED', dispatch_status: 'FULLY_DISPATCHED', packing_status: 'PACKED',
    delivered_at: stamp, delivered_by_id: user.id, delivered_by_name: user.name, updated_at: stamp,
  } });

  // Ledger recalculation moves received cash above the new total into party credit
  const fresh = await Order.row({ id: order.id });
  const ledger = await recalcOrderLedger(fresh, { userId: user.id });

  await addHistory(order.id, 'Remaining Units Cancelled', order.order_status, 'DELIVERED',
    `${pendingUnits} unit(s) cancelled by ${user.name} (${reason}). Order total ₹${inr(oldTotal)} -> ₹${inr(grandTotal)}.${ledger.excess > 0 ? ` ₹${inr(ledger.excess)} advance saved as party credit.` : ''}`, user.id);
  await logActivity(user.id, 'ORDER_CLOSED_SHORT', 'order', order.order_number,
    `${user.name} cancelled ${pendingUnits} remaining unit(s) of ${order.order_number}; ₹${inr(ledger.excess)} moved to party credit`);
  await sendNotification(order.sales_person_id, null, 'Remaining Units Cancelled',
    `Order ${order.order_number} closed with ${deliveredUnits} unit(s). ₹${inr(ledger.excess)} saved as party credit.`, 'info', order.id);

  res.json({
    message: ledger.excess > 0
      ? `Remaining ${pendingUnits} unit(s) cancelled. ₹${inr(ledger.excess)} saved as party credit.`
      : `Remaining ${pendingUnits} unit(s) cancelled. Order closed.`,
    cancelled_units: pendingUnits, new_total: grandTotal, credit_added: ledger.excess,
    amount_received: ledger.received, pending_amount: ledger.pending,
  });
};

// Hand over to Dispatch team
exports.handoverDispatch = async (req, res) => {
  const user = req.user;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  await fillItemQuantities(order.id, ['produced_quantity']);
  const now = nowStr();
  await Order.updateOne(
    { id: order.id },
    {
      $set: {
        packing_status: 'HANDED_OVER_TO_DISPATCH', production_status: 'PRODUCTION_COMPLETED',
        order_status: 'READY_FOR_DISPATCH', production_completed_at: now, updated_at: now,
      },
    }
  );
  await addHistory(order.id, 'Handed Over to Dispatch', order.packing_status || 'PACKED', 'READY_FOR_DISPATCH', 'Packed consignment handed over to logistics bay. Ready for vehicle loading.', user.id);
  await logActivity(user.id, 'PACKING_HANDOVER', 'order', order.order_number, `${user.name} handed over packed order ${order.order_number} to Dispatch`);
  await sendNotification(null, 'admin', 'Ready for Vehicle Loading', `Order ${order.order_number} packed and handed over to Dispatch bay`, 'success', order.id);

  res.json({ message: 'Order successfully handed over to Dispatch Team! Status updated to Ready for Dispatch.', packing_status: 'HANDED_OVER_TO_DISPATCH' });
};

// Backward compatible legacy routes
exports.legacyStartProduction = async (req, res) => {
  await Order.updateOne({ id: toId(req.params.id) }, { $set: { packing_status: 'PACKING_IN_PROGRESS', order_status: 'PROCESSING' } });
  res.json({ message: 'Packing started' });
};

exports.legacyMarkProductionCompleted = async (req, res) => {
  const id = toId(req.params.id);
  await fillItemQuantities(id, ['produced_quantity']);
  await Order.updateOne(
    { id },
    { $set: { packing_status: 'HANDED_OVER_TO_DISPATCH', production_status: 'PRODUCTION_COMPLETED', order_status: 'READY_FOR_DISPATCH' } }
  );
  res.json({ message: 'Handed over to Dispatch' });
};

// POST /api/orders/:id/packing-action  ( single endpoint, action in body )
exports.packingAction = async (req, res) => {
  const user = req.user;
  const canManagePacking =
    user.role_slug === 'super_admin' || user.permissions.includes('packing:manage') ||
    user.permissions.includes('production:update') || user.role_slug === 'admin' || user.role_slug === 'production_team';
  if (!canManagePacking) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to manage packing actions' });
  }

  const { action, item_id, availability, notes } = req.body;
  const order = await findOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const id = order.id;
  const now = nowStr();

  if (action === 'START_PACKING') {
    await Order.updateOne({ id }, { $set: { packing_status: 'PACKING_IN_PROGRESS', order_status: 'PROCESSING', updated_at: now } });
    await addHistory(id, 'Packing Started', order.packing_status, 'PACKING_IN_PROGRESS', 'Packing team started picking and packing finished lubricant items', user.id);
    return res.json({ message: 'Order packing in progress' });
  }

  if (action === 'ITEM_AVAILABILITY') {
    if (!item_id || !availability) {
      return res.status(400).json({ error: 'item_id and availability are required' });
    }
    await OrderItem.updateOne({ id: toId(item_id), order_id: id }, { $set: { item_availability: availability } });

    if (availability === 'NOT_AVAILABLE') {
      await Order.updateOne({ id }, { $set: { packing_status: 'ON_HOLD', order_status: 'ON_HOLD', updated_at: now } });
      await addHistory(id, 'Order On Hold', order.order_status, 'ON_HOLD', 'Item marked Not Available by Packing Team. Order placed On Hold.', user.id);
      await sendNotification(null, 'admin', 'Order On Hold - Item Unavailable', `Order ${order.order_number} marked ON HOLD by packing team: item out of stock`, 'warning', id);
    }
    return res.json({ message: `Item availability updated to ${availability}` });
  }

  if (action === 'MARK_ON_HOLD') {
    await Order.updateOne(
      { id },
      { $set: { packing_status: 'ON_HOLD', order_status: 'ON_HOLD', packing_notes: notes || 'Item not available in warehouse', updated_at: now } }
    );
    await addHistory(id, 'Order On Hold', order.order_status, 'ON_HOLD', notes || 'Placed on hold by Packing Team', user.id);
    await sendNotification(null, 'admin', 'Order Placed On Hold', `Order ${order.order_number} placed ON HOLD by packing team: ${notes || 'Stock unavailable'}`, 'warning', id);
    return res.json({ message: 'Order placed On Hold and Admin notified' });
  }

  if (action === 'PACKING_COMPLETED') {
    await fillItemQuantities(id, ['produced_quantity']);
    await Order.updateOne({ id }, { $set: { packing_status: 'PACKED', updated_at: now } });
    await addHistory(id, 'Packing Completed', order.packing_status, 'PACKED', 'Finished products packed and sealed in warehouse', user.id);
    return res.json({ message: 'Packing completed successfully' });
  }

  if (action === 'HANDOVER_DISPATCH') {
    await fillItemQuantities(id, ['produced_quantity']);
    await Order.updateOne(
      { id },
      { $set: { packing_status: 'HANDED_OVER', order_status: 'READY_FOR_DISPATCH', production_status: 'PRODUCTION_COMPLETED', updated_at: now } }
    );
    await addHistory(id, 'Handed Over to Dispatch', order.packing_status, 'READY_FOR_DISPATCH', 'Order packed and handed over to Dispatch Team. Ready for vehicle loading.', user.id);
    await sendNotification(null, 'dispatch', 'Ready for Dispatch', `Order ${order.order_number} has been packed and handed over for transport loading`, 'info', id);
    return res.json({ message: 'Order handed over to Dispatch Team successfully' });
  }

  if (action === 'DELIVER_ORDER') {
    await fillItemQuantities(id, ['produced_quantity', 'delivered_quantity']);
    const payload = await markDelivered(order, user);
    await logActivity(user.id, 'ORDER_DELIVERED', 'order', order.order_number, `${user.name} confirmed direct delivery of order ${order.order_number}`);
    await sendNotification(order.sales_person_id, null, 'Order Delivered', `Order ${order.order_number} has been Delivered!`, 'success', id);
    return res.json(payload);
  }

  res.status(400).json({ error: 'Unknown packing action' });
};

exports.filterOptionLists = filterOptionLists;
exports.fillItemQuantities = fillItemQuantities;
