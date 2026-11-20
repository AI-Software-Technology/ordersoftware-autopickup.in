const bcrypt = require('bcryptjs');
const models = require('../models');
const demo = require('./demoData');
const { ensurePermissions } = require('./permissions');

const {
  Role, Permission, User, Company, Brand, Category, Product, Vendor, Order, OrderItem, ProductionRecord,
  Dispatch, Delivery, Payment, OrderStatusHistory, ActivityLog, Notification, Setting, Counter, syncAllCounters,
} = models;

const ALL_MODELS = [
  Notification, ActivityLog, OrderStatusHistory, Payment, Delivery, Dispatch, ProductionRecord, OrderItem,
  Order, Vendor, Product, Category, Brand, Company, Permission, User, Role,
];

const withIds = (rows) => rows.map((r, i) => ({ id: i + 1, ...r }));
const mapOf = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r.id]));
const stamp = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

/**
 * Seeds the full demo dataset.
 * @param {boolean} force  true = wipe everything first ( "Reset Demo Database" )
 */
async function seedDatabase(force = false) {
  const userCount = await User.countDocuments({});
  if (!force && userCount > 0) {
    console.log('Database already seeded. Skipping seed.');
    return;
  }

  console.log('Seeding database with full dummy dataset...');

  // Always start from clean collections so numeric ids begin at 1
  for (const M of ALL_MODELS) await M.deleteMany({});
  await Setting.deleteMany({});
  await Counter.deleteMany({});

  const now = stamp(new Date());

  // 1. Permissions
  const permissions = withIds(demo.permissionsList);
  const permMap = mapOf(permissions, 'code');

  // 2. Roles ( + their permissions )
  const roles = withIds(demo.roles).map((r) => ({
    ...r,
    created_at: now,
    permission_ids:
      r.slug === 'super_admin'
        ? permissions.map((p) => p.id)
        : (demo.rolePermissions[r.slug] || []).map((c) => permMap[c]).filter(Boolean),
  }));
  const roleMap = mapOf(roles, 'slug');

  // 3. Users
  const hashCache = {};
  const hash = (pw) => (hashCache[pw] = hashCache[pw] || bcrypt.hashSync(pw, 10));
  const users = withIds(demo.users).map(({ password, role, ...u }) => ({
    ...u,
    password_hash: hash(password),
    role_id: roleMap[role],
    status: 'active',
    created_at: now,
  }));
  const userMap = mapOf(users, 'email');

  // 4. Billing companies, brands, categories
  const companies = withIds(demo.companies).map((c) => ({ ...c, created_at: now }));
  const brands = withIds(demo.brands).map((b) => ({ ...b, created_at: now }));
  const categories = withIds(demo.categories).map((c) => ({ ...c, created_at: now }));
  const brandMap = mapOf(brands, 'name');
  const catMap = mapOf(categories, 'name');

  // 5. Products
  const fallbackImage = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=500&auto=format&fit=crop&q=80';
  const products = demo.products.map((p, i) => {
    const imgList = demo.imagesByCat[p.cat] || [fallbackImage];
    return {
      id: i + 1,
      name: p.name,
      brand_id: brandMap[p.brand],
      category_id: catMap[p.cat],
      sku: p.sku,
      unit: p.unit,
      min_order_qty: p.minQty,
      standard_rate: p.rate,
      description: p.desc,
      image_url: imgList[i % imgList.length],
      created_at: now,
    };
  });
  const productMap = mapOf(products, 'sku');

  // 6. Parties ( assigned to Akash, Rahul, Deepak )
  const akashId = userMap['akash@lubricantdemo.com'];
  const rahulId = userMap['rahul@lubricantdemo.com'];
  const deepakId = userMap['deepak@lubricantdemo.com'];
  const adminId = userMap['admin@lubricantdemo.com'];
  const prodUserId = userMap['production@lubricantdemo.com'];
  const accountsUserId = userMap['accounts@lubricantdemo.com'];

  const vendors = demo.buildVendors({ akashId, rahulId, deepakId }).map((v, i) => ({
    id: i + 1,
    vendor_code: v.code,
    company_name: v.company,
    contact_person: v.contact,
    mobile: v.phone,
    alt_mobile: null,
    email: v.email,
    gstin: v.gstin,
    billing_address: v.address,
    delivery_address: v.delivery,
    city: v.city,
    state: v.state,
    pincode: v.pin,
    assigned_sales_person_id: v.salesId,
    created_by_id: v.salesId,
    status: 'active',
    created_at: now,
  }));
  const vendorByCode = Object.fromEntries(vendors.map((v) => [v.vendor_code, v]));

  // 7. Order scenarios: hand written + 42 historical orders for charts & reports
  const companyAId = companies.find((c) => c.code === 'CMP-A').id;
  const companyBId = companies.find((c) => c.code === 'CMP-B').id;
  const orderConfigs = demo.buildOrderConfigs({ akashId, rahulId, companyAId, companyBId });

  const allVendorCodes = vendors.map((v) => v.vendor_code);
  const sampleProducts = demo.products.slice(0, 15);
  const statusesPool = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'DELIVERED', 'COMPLETED', 'DELIVERED', 'READY_FOR_DISPATCH', 'PROCESSING', 'NEW'];

  for (let i = 1; i <= 42; i++) {
    const vCode = allVendorCodes[i % allVendorCodes.length];
    const p1 = sampleProducts[(i * 3) % sampleProducts.length];
    const p2 = sampleProducts[(i * 7) % sampleProducts.length];
    const assignedStatus = statusesPool[i % statusesPool.length];

    const isCompleted = assignedStatus === 'COMPLETED';
    const isDelivered = assignedStatus === 'DELIVERED' || isCompleted;
    const isDispatched = assignedStatus === 'OUT_FOR_DELIVERY' || isDelivered;
    const isProdCompleted = assignedStatus === 'READY_FOR_DISPATCH' || isDispatched;

    const payStatus = isCompleted
      ? 'FULLY_PAID'
      : isDelivered ? (i % 2 === 0 ? 'PARTIALLY_PAID' : 'UNPAID') : (i % 3 === 0 ? 'ADVANCE_RECEIVED' : 'UNPAID');
    const qty1 = (i % 4) + 1;
    const qty2 = ((i + 1) % 3) + 1;

    orderConfigs.push({
      num: `ORD-${10000 + i}`,
      vendor: vCode,
      sales: vendorByCode[vCode].assigned_sales_person_id,
      company: i % 2 === 0 ? companyAId : companyBId,
      status: assignedStatus,
      prodStatus: isProdCompleted ? 'PRODUCTION_COMPLETED' : assignedStatus === 'PROCESSING' ? 'IN_PRODUCTION' : 'NOT_ASSIGNED',
      dispStatus: isDispatched ? 'FULLY_DISPATCHED' : 'NOT_DISPATCHED',
      delStatus: isDelivered ? 'DELIVERED' : assignedStatus === 'OUT_FOR_DELIVERY' ? 'OUT_FOR_DELIVERY' : 'PENDING',
      payStatus,
      terms: i % 2 === 0 ? 'Credit 30 Days' : 'Partial Payment',
      advance: payStatus === 'ADVANCE_RECEIVED' ? 20000 : 0,
      fullPaid: isCompleted,
      reqDate: `2026-0${Math.min(9, 7 + Math.floor(i / 15))}-${10 + (i % 18)}`,
      items: [
        { sku: p1.sku, name: p1.name, unit: p1.unit, qty: qty1, rate: p1.rate, prodQty: isProdCompleted ? qty1 : 0, dispQty: isDispatched ? qty1 : 0, delQty: isDelivered ? qty1 : 0 },
        { sku: p2.sku, name: p2.name, unit: p2.unit, qty: qty2, rate: p2.rate, prodQty: isProdCompleted ? qty2 : 0, dispQty: isDispatched ? qty2 : 0, delQty: isDelivered ? qty2 : 0 },
      ],
      createdDaysAgo: 10 + i * 2,
      dispatches: isDispatched
        ? [{ num: `DSP-${7000 + i}`, transporter: i % 2 === 0 ? 'VRL Logistics' : 'TCI Freight', vehicle: `MH-${12 + (i % 20)}-AB-${1000 + i}`, lr: `LR-${50000 + i}`, driver: 'Raju Driver', driverPhone: '+91 98000 11223', qty: qty1 + qty2 }]
        : undefined,
      deliveries: isDelivered
        ? [{ dispNum: `DSP-${7000 + i}`, date: `2026-08-${10 + (i % 15)}`, qty: qty1 + qty2, receiver: 'Warehouse Manager', receiverPhone: '+91 98000 99887', notes: 'Material received and checked' }]
        : undefined,
    });
  }

  // 8. Build orders and every related record
  const orders = [];
  const orderItems = [];
  const history = [];
  const prodRecords = [];
  const dispatches = [];
  const deliveries = [];
  const payments = [];
  const activityLogs = [];
  const next = (arr) => arr.length + 1;
  let paymentCounter = 100;

  for (const cfg of orderConfigs) {
    const vendor = vendorByCode[cfg.vendor];
    if (!vendor) continue;

    const subtotal = cfg.items.reduce((acc, it) => acc + it.qty * it.rate, 0);
    const taxRate = 18.0;
    const taxAmount = (subtotal * taxRate) / 100;
    const grandTotal = subtotal + taxAmount;

    let amountReceived = 0;
    if (cfg.fullPaid) amountReceived = grandTotal;
    else if (cfg.advance) amountReceived = cfg.advance;
    else if (cfg.payStatus === 'PARTIALLY_PAID') amountReceived = Math.round(grandTotal * 0.5);
    const pendingAmount = Math.max(0, grandTotal - amountReceived);

    const dateStr = stamp(new Date(Date.now() - (cfg.createdDaysAgo || 1) * 86400000));
    const day = dateStr.slice(0, 10);
    const orderId = next(orders);

    orders.push({
      id: orderId,
      order_number: cfg.num,
      company_id: cfg.company,
      vendor_id: vendor.id,
      sales_person_id: cfg.sales,
      order_status: cfg.status,
      production_status: cfg.prodStatus,
      dispatch_status: cfg.dispStatus,
      delivery_status: cfg.delStatus,
      payment_status: cfg.payStatus,
      payment_terms: cfg.terms,
      subtotal,
      discount_amount: 0,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      amount_received: amountReceived,
      pending_amount: pendingAmount,
      required_delivery_date: cfg.reqDate,
      delivery_address: vendor.delivery_address,
      delivery_contact_person: vendor.contact_person,
      delivery_contact_number: vendor.mobile,
      special_instructions: 'Fragile - Keep Drums Upright. Use Hydraulic Lift.',
      cancellation_reason: cfg.cancelReason || null,
      cancelled_by_id: cfg.cancelReason ? adminId : null,
      cancelled_at: cfg.cancelReason ? dateStr : null,
      assigned_to_production_at: cfg.prodStatus !== 'NOT_ASSIGNED' ? dateStr : null,
      production_completed_at: cfg.prodStatus === 'PRODUCTION_COMPLETED' ? dateStr : null,
      dispatched_at: cfg.dispStatus !== 'NOT_DISPATCHED' ? dateStr : null,
      delivered_at: cfg.delStatus === 'DELIVERED' ? dateStr : null,
      completed_at: cfg.status === 'COMPLETED' ? dateStr : null,
      completed_by_id: cfg.status === 'COMPLETED' ? adminId : null,
      created_by_id: cfg.sales,
      created_at: dateStr,
      updated_at: dateStr,
    });

    // Items
    const itemIds = [];
    for (const it of cfg.items) {
      const id = next(orderItems);
      itemIds.push(id);
      orderItems.push({
        id,
        order_id: orderId,
        product_id: productMap[it.sku] || 1,
        sku: it.sku,
        product_name: it.name,
        unit: it.unit,
        quantity: it.qty,
        produced_quantity: it.prodQty || 0,
        dispatched_quantity: it.dispQty || 0,
        delivered_quantity: it.delQty || 0,
        rate: it.rate,
        line_amount: it.qty * it.rate,
        notes: 'Standard factory packing',
      });
    }

    // Status history
    const addHistory = (stage, prev, status, notes, userId) =>
      history.push({ id: next(history), order_id: orderId, stage_name: stage, previous_status: prev, new_status: status, notes, created_by_id: userId, created_at: dateStr });

    addHistory('Order Created', null, 'NEW', 'Sales Person submitted order', cfg.sales);
    if (cfg.status !== 'NEW') addHistory('Order Accepted', 'NEW', 'ACCEPTED', 'Approved by Operations Admin', adminId);
    if (cfg.prodStatus !== 'NOT_ASSIGNED') addHistory('Production Assigned', 'ACCEPTED', 'PROCESSING', 'Assigned to Plant Formulation Team', adminId);
    if (cfg.prodStatus === 'PRODUCTION_COMPLETED') addHistory('Production Completed', 'PROCESSING', 'READY_FOR_DISPATCH', 'Batch production and QC testing finished', prodUserId);
    if (cfg.dispStatus !== 'NOT_DISPATCHED') addHistory('Dispatched', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'Consignment loaded on transport vehicle', prodUserId);
    if (cfg.delStatus === 'DELIVERED') addHistory('Delivered', 'OUT_FOR_DELIVERY', 'DELIVERED', 'Customer received and signed proof of delivery', prodUserId);
    if (cfg.status === 'COMPLETED') addHistory('Order Completed', 'DELIVERED', 'COMPLETED', 'Delivery confirmed and full invoice payment reconciled', adminId);
    if (cfg.status === 'CANCELLED') addHistory('Order Cancelled', 'NEW', 'CANCELLED', cfg.cancelReason || 'Cancelled upon request', adminId);

    // Production records
    const addProd = (itemId, batch, qty, notes) =>
      prodRecords.push({
        id: next(prodRecords), order_id: orderId, order_item_id: itemId, batch_number: batch, produced_quantity: qty,
        production_date: day, operator_name: 'Vikram Patel', notes, created_by_id: prodUserId, created_at: dateStr,
      });
    if (cfg.prodLog) {
      for (const pl of cfg.prodLog) addProd(itemIds[pl.itemIdx] || itemIds[0], pl.batch, pl.qty, pl.notes);
    } else if (cfg.prodStatus === 'PRODUCTION_COMPLETED') {
      cfg.items.forEach((it, idx) => addProd(itemIds[idx], `BTH-AUTO-${orderId}-${idx + 1}`, it.qty, 'Batch formulation compliant with ISO specifications'));
    }

    // Dispatches & deliveries
    for (const d of cfg.dispatches || []) {
      const dispatchId = next(dispatches);
      dispatches.push({
        id: dispatchId, dispatch_number: d.num, order_id: orderId, dispatch_date: day, transport_name: d.transporter,
        transport_contact: '+91 22 2844 9900', vehicle_number: d.vehicle, lr_number: d.lr, tracking_number: `TRK-${d.lr}`,
        driver_name: d.driver, driver_mobile: d.driverPhone, dispatch_quantity: d.qty, notes: 'Handling precautions noted',
        items: itemIds.map((itemId) => ({ order_item_id: itemId, quantity: d.qty / itemIds.length })),
        created_by_id: prodUserId, created_at: dateStr,
      });

      for (const del of cfg.deliveries || []) {
        deliveries.push({
          id: next(deliveries), order_id: orderId, dispatch_id: dispatchId, delivery_date: del.date,
          delivered_quantity: del.qty, received_by: del.receiver, receiver_mobile: del.receiverPhone,
          pod_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80',
          notes: del.notes,
          items: itemIds.map((itemId) => ({ order_item_id: itemId, quantity: del.qty / itemIds.length })),
          created_by_id: prodUserId, created_at: dateStr,
        });
      }
    }

    // Payments ( all verified )
    const addPayment = (amount, mode, refSuffix, notes, receivedBy) => {
      paymentCounter++;
      payments.push({
        id: next(payments), payment_number: `PAY-${paymentCounter}`, order_id: orderId, amount, payment_date: day,
        payment_mode: mode, reference_number: `REF-TXN-${paymentCounter}${refSuffix}`, notes,
        is_verified: 1, status: 'VERIFIED', received_by_id: receivedBy, verified_by_id: accountsUserId,
        verified_at: dateStr, created_at: dateStr,
      });
    };
    if (amountReceived > 0) {
      const initialAmt = cfg.fullPaid && amountReceived > 50000 ? Math.round(amountReceived * 0.4) : amountReceived;
      addPayment(
        initialAmt,
        initialAmt > 30000 ? 'NEFT/RTGS' : initialAmt > 10000 ? 'UPI' : 'Cheque',
        '492', 'Payment received against order advance/invoice', cfg.sales
      );
      if (cfg.fullPaid && initialAmt < amountReceived) {
        addPayment(amountReceived - initialAmt, 'Bank Transfer', '781', 'Balance final settlement received upon delivery', accountsUserId);
      }
    }

    activityLogs.push({
      id: next(activityLogs), user_id: cfg.sales, action: 'ORDER_CREATED', entity_type: 'order', entity_id: cfg.num,
      description: `Sales Person created order ${cfg.num} with total value ₹${grandTotal.toLocaleString('en-IN')}`,
      created_at: dateStr,
    });
  }

  // 9. Initial in-app notifications
  const iso = new Date().toISOString();
  const notifications = withIds([
    { user_id: akashId, role_slug: 'sales_person', title: 'New Order Placed', message: 'Order ORD-10170 has been submitted for Admin approval', type: 'info', order_id: 1 },
    { user_id: adminId, role_slug: 'admin', title: 'Approval Required', message: 'Order ORD-10170 is waiting for review and approval', type: 'warning', order_id: 1 },
    { user_id: prodUserId, role_slug: 'production_team', title: 'New Production Job', message: 'Order ORD-10165 assigned to plant for formulation', type: 'info', order_id: 7 },
    { user_id: accountsUserId, role_slug: 'accounts', title: 'Payment Verification Needed', message: 'Advance payment for ORD-10171 received via UPI', type: 'info', order_id: 2 },
  ]).map((n) => ({ ...n, is_read: 0, created_at: iso }));

  // 10. Write everything
  await Permission.insertMany(permissions);
  await Role.insertMany(roles);
  await User.insertMany(users);
  await Company.insertMany(companies);
  await Brand.insertMany(brands);
  await Category.insertMany(categories);
  await Product.insertMany(products);
  await Vendor.insertMany(vendors);
  await Order.insertMany(orders);
  await OrderItem.insertMany(orderItems);
  await OrderStatusHistory.insertMany(history);
  if (prodRecords.length) await ProductionRecord.insertMany(prodRecords);
  if (dispatches.length) await Dispatch.insertMany(dispatches);
  if (deliveries.length) await Delivery.insertMany(deliveries);
  if (payments.length) await Payment.insertMany(payments);
  await ActivityLog.insertMany(activityLogs);
  await Notification.insertMany(notifications);

  await Setting.setValue('tax_gst_percentage', '18');
  await Setting.setValue('default_credit_days', '30');
  await Setting.setValue('app_name', 'Auto pickup Lubricant ERP');

  await syncAllCounters();
  // Complete the permission matrix ( Packing Team role, bills / payments permissions ... )
  await ensurePermissions();

  console.log(
    `Database seeded successfully! Orders: ${orders.length}, Payments: ${payments.length}, Vendors: ${vendors.length}, Products: ${products.length}`
  );
}

module.exports = { seedDatabase };
