const {
  Order,
  OrderItem,
  Payment,
  Vendor,
  Product,
  User,
  Role,
  ActivityLog,
} = require("../models");
const {
  todayStr,
  dateOf,
  monthOf,
  addDateRange,
  inDateRange,
  sumBy,
  countBy,
  uniq,
  groupBy,
  toId,
  isShortRange,
} = require("../utils/helpers");
const {
  todayLocal,
  localDateOf,
  localMonthOf,
  localInRange,
  addLocalDateRange,
} = require("../utils/localtime");
const {
  loadOrderRefs,
  loadItemsByOrder,
  getSalesPersonUsers,
  isActive,
} = require("../utils/queries");

const ORDER_FIELDS =
  "id order_number order_status production_status packing_status packing_notes dispatch_status delivery_status " +
  "payment_status grand_total amount_received pending_amount created_at updated_at delivered_at " +
  "required_delivery_date vendor_id sales_person_id company_id";

const notCancelled = (o) => o.order_status !== "CANCELLED";

const isClosedOrder = (o) =>
  ["DELIVERED", "COMPLETED", "CANCELLED"].includes(o.order_status);

// Advance = money already paid on an OPEN order for goods that are NOT delivered yet.
//   advance = min(paid, order total) - value of goods already delivered
//   e.g. order 4800, paid 4800, goods worth 2100 delivered  ->  advance 2700
// Party credit = extra money a party paid ABOVE an order total ( Vendor.credit_balance )
async function buildAdvanceStats(orders, vendorFilter = {}, refs = null) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const open = orders.filter(
    (o) => !isClosedOrder(o) && (o.amount_received || 0) > 0,
  );
  const items = open.length
    ? await OrderItem.rows(
        { order_id: { $in: open.map((o) => o.id) } },
        { select: "order_id delivered_quantity rate" },
      )
    : [];
  const deliveredValue = new Map();
  for (const i of items) {
    deliveredValue.set(
      i.order_id,
      (deliveredValue.get(i.order_id) || 0) +
        (i.delivered_quantity || 0) * (i.rate || 0),
    );
  }

  let advanceHeld = 0;
  const advanceList = [];
  for (const o of open) {
    const paid = Math.min(o.amount_received || 0, o.grand_total || 0);
    const delivered = deliveredValue.get(o.id) || 0;
    const held = Math.max(0, paid - delivered);
    if (held > 0.01) {
      advanceHeld += held;
      advanceList.push({
        id: o.id,
        order_number: o.order_number,
        party_name: refs?.vendors?.get(o.vendor_id)?.company_name ?? null,
        order_total: r2(o.grand_total || 0),
        paid: r2(paid),
        delivered_value: r2(delivered),
        advance: r2(held),
      });
    }
  }
  advanceList.sort((a, b) => b.advance - a.advance);

  const credits = await Vendor.rows(
    { ...vendorFilter, credit_balance: { $gt: 0 } },
    { select: "company_name credit_balance" },
  );
  const partyCredit = sumBy(credits, (v) => v.credit_balance);
  const creditList = credits
    .map((v) => ({ id: v.id, party_name: v.company_name, credit: r2(v.credit_balance) }))
    .sort((a, b) => b.credit - a.credit)
    .slice(0, 10);

  return {
    advanceHeld: r2(advanceHeld), // advance sitting on open orders
    advanceOrders: advanceList.length, // how many orders have advance
    advanceList: advanceList.slice(0, 500), // order by order proof of the advance number ( UI paginates )
    partyCredit: r2(partyCredit), // extra money saved per party
    partyCreditParties: credits.length, // how many parties have credit
    creditList,
    totalAdvance: r2(advanceHeld + partyCredit),
  };
}

const isVerifiedPayment = (p) => p.is_verified === 1 || p.status === "VERIFIED";
const isPendingPayment = (p) =>
  p.is_verified === 0 &&
  (p.status === null ||
    p.status === undefined ||
    p.status === "PENDING_VERIFICATION");
const CLOSED_FOR_PACKING = [
  "READY_FOR_DISPATCH",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

// ---------------------------------------------------------------------------
// Shared builders
// ---------------------------------------------------------------------------
function statusTotals(orders) {
  const countsMap = {};
  let total = 0;
  let salesValue = 0;
  let received = 0;
  let pending = 0;
  for (const o of orders) {
    countsMap[o.order_status] = (countsMap[o.order_status] || 0) + 1;
    total += 1;
    if (notCancelled(o)) {
      salesValue += o.grand_total || 0;
      received += o.amount_received || 0;
      pending += o.pending_amount || 0;
    }
  }
  return { countsMap, total, salesValue, received, pending };
}

function buildTrend(orders, short, keyName) {
  const groups = groupBy(orders, (o) =>
    short ? localDateOf(o.created_at) : localMonthOf(o.created_at),
  );
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, list]) => ({
      [keyName]: key,
      orders_count: list.length,
      total_sales: sumBy(list.filter(notCancelled), (o) => o.grand_total),
      total_received: sumBy(
        list.filter(notCancelled),
        (o) => o.amount_received,
      ),
    }));
}

async function buildTopProducts(orders, limit) {
  const ids = orders.filter(notCancelled).map((o) => o.id);
  if (!ids.length) return [];
  const items = await OrderItem.rows(
    { order_id: { $in: ids } },
    { select: "product_id sku product_name quantity line_amount" },
  );
  const groups = groupBy(items, (i) => `${i.product_id}|${i.sku}`);
  const products = await Product.byIds(
    uniq(items.map((i) => i.product_id)),
    "id image_url",
  );
  return [...groups.values()]
    .map((list) => ({
      product_name: list[0].product_name,
      sku: list[0].sku,
      product_image: products.get(list[0].product_id)?.image_url ?? null,
      total_qty: sumBy(list, (i) => i.quantity),
      total_amount: sumBy(list, (i) => i.line_amount),
    }))
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, limit);
}

function buildTopVendors(orders, vendors, limit) {
  const groups = groupBy(orders.filter(notCancelled), (o) => o.vendor_id);
  return [...groups.entries()]
    .filter(([vendorId]) => vendors.has(vendorId))
    .map(([vendorId, list]) => {
      const v = vendors.get(vendorId);
      return {
        id: v.id,
        company_name: v.company_name,
        city: v.city,
        order_count: list.length,
        total_spent: sumBy(list, (o) => o.grand_total),
        pending: sumBy(list, (o) => o.pending_amount),
      };
    })
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, limit);
}

async function buildRecentOrders(orders, refs, limit = 10) {
  const recent = [...orders].sort((a, b) => b.id - a.id).slice(0, limit);
  const itemsMap = await loadItemsByOrder(recent.map((o) => o.id));
  const allItems = [...itemsMap.values()].flat();
  const products = await Product.byIds(
    uniq(allItems.map((i) => i.product_id)),
    "id name sku image_url unit",
  );

  return recent.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    order_status: o.order_status,
    grand_total: o.grand_total,
    amount_received: o.amount_received,
    pending_amount: o.pending_amount,
    created_at: o.created_at,
    required_delivery_date: o.required_delivery_date,
    packing_status: o.packing_status,
    dispatch_status: o.dispatch_status,
    delivery_status: o.delivery_status,
    vendor_name: refs.vendors.get(o.vendor_id)?.company_name ?? null,
    sales_person_name: refs.users.get(o.sales_person_id)?.name ?? null,
    company_name: refs.companies.get(o.company_id)?.name ?? null,
    items: (itemsMap.get(o.id) || [])
      .filter((i) => products.has(i.product_id))
      .map((i) => {
        const p = products.get(i.product_id);
        return {
          ...i,
          product_name: p.name,
          sku: p.sku,
          product_image: p.image_url,
          unit: p.unit,
        };
      }),
  }));
}

const vendorOptions = async () =>
  (
    await Vendor.rows(
      {},
      { select: "id company_name", sort: { company_name: 1 } },
    )
  ).map((v) => ({
    id: v.id,
    name: v.company_name,
  }));

// ---------------------------------------------------------------------------
// 1. SALES PERSON DASHBOARD (strict data isolation - only own orders)
// ---------------------------------------------------------------------------
async function salesPersonDashboard(user, { sDate, eDate }) {
  const isSuperAdmin = user.role_slug === "super_admin";
  const canViewPayments =
    isSuperAdmin || user.permissions.includes("payments:view");

  const filter = addLocalDateRange(
    { sales_person_id: user.id },
    "created_at",
    sDate,
    eDate,
  );
  const orders = await Order.rows(filter, { select: ORDER_FIELDS });
  const t = statusTotals(orders);

  const myNewOrders = t.countsMap.NEW || 0;
  const myApprovedOrders = t.countsMap.ACCEPTED || 0;
  const myDeliveredOrders =
    (t.countsMap.DELIVERED || 0) + (t.countsMap.COMPLETED || 0);
  const myCancelledOrders = t.countsMap.CANCELLED || 0;
  // Packed but not delivered orders count under Packing
  const myOrdersInPacking = Math.max(
    0,
    t.total -
      myNewOrders -
      myApprovedOrders -
      myDeliveredOrders -
      myCancelledOrders,
  );

  const [vendorCount, refs, topProducts, advance] = await Promise.all([
    Vendor.countDocuments({ assigned_sales_person_id: user.id }),
    loadOrderRefs(orders),
    buildTopProducts(orders, 5),
    buildAdvanceStats(orders, { assigned_sales_person_id: user.id }),
  ]);

  const monthlyData = buildTrend(
    orders,
    isShortRange(sDate, eDate, 31),
    "month",
  );
  const topVendors = buildTopVendors(orders, refs.vendors, 5);
  const recentOrders = await buildRecentOrders(orders, refs);

  return {
    roleType: "sales_person",
    canViewPayments,
    cards: {
      myTotalOrders: t.total,
      myNewOrders,
      myApprovedOrders,
      myOrdersInPacking,
      myDeliveredOrders,
      myCancelledOrders,
      myTotalSalesValue: canViewPayments ? t.salesValue : null,
      myVerifiedPaymentReceived: canViewPayments ? t.received : null,
      myBalancePayment: canViewPayments ? t.pending : null,
      myPendingPayment: canViewPayments ? t.pending : null,
      myAdvanceHeld: canViewPayments ? advance.advanceHeld : null,
      myPartyCredit: canViewPayments ? advance.partyCredit : null,
      myTotalAdvance: canViewPayments ? advance.totalAdvance : null,
      myParties: vendorCount || 0,
      myVendors: vendorCount || 0,
    },
    charts: {
      myMonthlySales: canViewPayments
        ? monthlyData
        : monthlyData.map((m) => ({ ...m, total_sales: 0, total_received: 0 })),
      myOrdersByStatus: [
        { status: "NEW", label: "New", count: myNewOrders, color: "#3b82f6" },
        {
          status: "ACCEPTED",
          label: "Approved",
          count: myApprovedOrders,
          color: "#6366f1",
        },
        {
          status: "PROCESSING",
          label: "Packing",
          count: myOrdersInPacking,
          color: "#f59e0b",
        },
        {
          status: "DELIVERED",
          label: "Delivered",
          count: myDeliveredOrders,
          color: "#10b981",
        },
        {
          status: "CANCELLED",
          label: "Cancelled",
          count: myCancelledOrders,
          color: "#ef4444",
        },
      ],
      myPaymentReceivedVsPending: canViewPayments
        ? { received: t.received, pending: t.pending, total: t.salesValue }
        : null,
      myTopProducts: topProducts,
      myTopVendors: topVendors,
    },
    recentOrders,
  };
}

// ---------------------------------------------------------------------------
// 2. PACKING TEAM DASHBOARD (no financial data at all)
// ---------------------------------------------------------------------------
async function packingDashboard({ sDate, eDate, sales_person_id, vendor_id }) {
  const today = todayLocal();
  const filter = addLocalDateRange(
    { order_status: { $ne: "CANCELLED" } },
    "created_at",
    sDate,
    eDate,
  );
  if (isActive(sales_person_id))
    filter.sales_person_id = Number(sales_person_id);
  if (isActive(vendor_id)) filter.vendor_id = Number(vendor_id);

  const orders = await Order.rows(filter, { select: ORDER_FIELDS });
  const open = (o) => !CLOSED_FOR_PACKING.includes(o.order_status);
  const isDelivered = (o) =>
    o.order_status === "DELIVERED" || o.delivery_status === "DELIVERED";

  const pendingPacking = countBy(
    orders,
    (o) =>
      (o.packing_status === "PENDING_PACKING" ||
        (o.packing_status == null &&
          ["ACCEPTED", "PROCESSING"].includes(o.order_status))) &&
      open(o),
  );
  const packingInProgress = countBy(
    orders,
    (o) =>
      (o.packing_status === "IN_PROGRESS" ||
        o.production_status === "IN_PRODUCTION") &&
      open(o),
  );
  const packedOrders = countBy(
    orders,
    (o) =>
      o.packing_status === "PACKED" ||
      o.production_status === "PRODUCTION_COMPLETED",
  );
  const deliveredOrders = countBy(orders, isDelivered);
  const ordersOnHold = countBy(
    orders,
    (o) =>
      o.packing_status === "ON_HOLD" ||
      String(o.packing_notes || "")
        .toLowerCase()
        .includes("hold"),
  );

  const toPackIds = orders
    .filter(
      (o) =>
        ["PENDING_PACKING", "IN_PROGRESS"].includes(o.packing_status) &&
        open(o),
    )
    .map((o) => o.id);

  const [todayDeliveredOrders, todayPacking, toPackItems] = await Promise.all([
    Order.countDocuments({
      ...addLocalDateRange({}, "delivered_at", today, today),
      $or: [{ order_status: "DELIVERED" }, { delivery_status: "DELIVERED" }],
    }),
    Order.countDocuments({
      ...addLocalDateRange({}, "updated_at", today, today),
      packing_status: { $in: ["PACKED", "IN_PROGRESS", "HANDED_OVER"] },
    }),
    toPackIds.length
      ? OrderItem.rows({ order_id: { $in: toPackIds } }, { select: "quantity" })
      : [],
  ]);
  const totalItemsToPack = sumBy(toPackItems, (i) => i.quantity);

  // Packing queue: in-progress first, then pending, on-hold, packed
  const rank = (o) =>
    ({ IN_PROGRESS: 1, PENDING_PACKING: 2, ON_HOLD: 3, PACKED: 4 })[
      o.packing_status
    ] || 5;
  const queue = [...orders]
    .sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const da = a.required_delivery_date || "";
      const db = b.required_delivery_date || "";
      if (da !== db) return da < db ? -1 : 1;
      return b.id - a.id;
    })
    .slice(0, 25);

  const [refs, itemsMap] = await Promise.all([
    loadOrderRefs(queue, { companies: false }),
    loadItemsByOrder(queue.map((o) => o.id)),
  ]);
  const products = await Product.byIds(
    uniq([...itemsMap.values()].flat().map((i) => i.product_id)),
    "id image_url",
  );

  const packingQueue = queue.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    order_status: o.order_status,
    packing_status: o.packing_status,
    packing_notes: o.packing_notes,
    required_delivery_date: o.required_delivery_date,
    created_at: o.created_at,
    updated_at: o.updated_at,
    vendor_name: refs.vendors.get(o.vendor_id)?.company_name ?? null,
    vendor_city: refs.vendors.get(o.vendor_id)?.city ?? null,
    sales_person_name: refs.users.get(o.sales_person_id)?.name ?? null,
    items: (itemsMap.get(o.id) || []).map((i) => ({
      id: i.id,
      sku: i.sku,
      product_name: i.product_name,
      unit: i.unit,
      quantity: i.quantity,
      produced_quantity: i.produced_quantity,
      item_availability: i.item_availability,
      product_image: products.get(i.product_id)?.image_url ?? null,
    })),
  }));

  const [salesPersons, vendors] = await Promise.all([
    getSalesPersonUsers(),
    vendorOptions(),
  ]);

  return {
    roleType: "packing_team",
    cards: {
      pendingPacking,
      packingInProgress,
      packedOrders,
      deliveredOrders,
      todayPacking,
      todayDeliveredOrders,
      totalItemsToPack,
      ordersOnHold,
      completedPacking: packedOrders,
    },
    packingQueue,
    filterOptions: { salesPersons, vendors, parties: vendors },
  };
}

// ---------------------------------------------------------------------------
// 3. ACCOUNTS TEAM DASHBOARD (payments, verification, collections)
// ---------------------------------------------------------------------------
async function accountsDashboard({ sDate, eDate }) {
  const today = todayLocal();
  const thisMonth = today.slice(0, 7);

  const [allPayments, activeOrders] = await Promise.all([
    Payment.rows({}, { sort: { id: -1 } }),
    Order.rows(
      { order_status: { $ne: "CANCELLED" } },
      {
        select:
          "id pending_amount payment_status grand_total amount_received order_status",
      },
    ),
  ]);

  const inPeriod = allPayments.filter(
    (p) => (!sDate && !eDate) || inDateRange(p.payment_date, sDate, eDate),
  );
  const verified = allPayments.filter(isVerifiedPayment);

  const pendingList = allPayments.filter(isPendingPayment).slice(0, 12);
  const recentList = inPeriod.slice(0, 15);

  const orderMap = await Order.byIds(
    uniq([...pendingList, ...recentList].map((p) => p.order_id)),
    "id order_number grand_total pending_amount vendor_id",
  );
  const [vendorMap, userMap] = await Promise.all([
    Vendor.byIds(
      uniq([...orderMap.values()].map((o) => o.vendor_id)),
      "id company_name",
    ),
    User.byIds(uniq(pendingList.map((p) => p.received_by_id)), "id name"),
  ]);
  const vendorName = (p) =>
    vendorMap.get(orderMap.get(p.order_id)?.vendor_id)?.company_name ?? null;

  const pendingVerificationList = pendingList.map((p) => {
    const o = orderMap.get(p.order_id);
    return {
      id: p.id,
      payment_number: p.payment_number,
      order_id: p.order_id,
      amount: p.amount,
      payment_date: p.payment_date,
      payment_mode: p.payment_mode,
      reference_number: p.reference_number,
      notes: p.notes,
      proof_url: p.proof_url,
      status: p.status,
      created_at: p.created_at,
      order_number: o?.order_number ?? null,
      order_total: o?.grand_total ?? null,
      pending_amount: o?.pending_amount ?? null,
      vendor_name: vendorName(p),
      received_by_name: userMap.get(p.received_by_id)?.name ?? null,
    };
  });

  const recentPayments = recentList.map((p) => ({
    id: p.id,
    payment_number: p.payment_number,
    order_id: p.order_id,
    amount: p.amount,
    payment_date: p.payment_date,
    payment_mode: p.payment_mode,
    reference_number: p.reference_number,
    notes: p.notes,
    proof_url: p.proof_url,
    is_verified: p.is_verified,
    status: p.status,
    created_at: p.created_at,
    order_number: orderMap.get(p.order_id)?.order_number ?? null,
    vendor_name: vendorName(p),
  }));

  // Collection chart ( verified payments only )
  const short = isShortRange(sDate, eDate, 31);
  const chartSource = verified.filter(
    (p) => (!sDate && !eDate) || inDateRange(p.payment_date, sDate, eDate),
  );
  const paymentChart = [
    ...groupBy(chartSource, (p) =>
      short ? dateOf(p.payment_date) : monthOf(p.payment_date),
    ).entries(),
  ]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([period, list]) => ({
      period,
      total_collected: sumBy(list, (p) => p.amount),
      payment_count: list.length,
    }));

  const advance = await buildAdvanceStats(activeOrders);
  const fullyPaid = countBy(activeOrders, (o) =>
    ["PAID", "FULLY_PAID"].includes(o.payment_status),
  );
  const partiallyPaid = countBy(activeOrders, (o) =>
    ["PARTIALLY_PAID", "PARTIAL_PAYMENT", "ADVANCE_RECEIVED"].includes(
      o.payment_status,
    ),
  );
  const unpaid = countBy(activeOrders, (o) => o.payment_status === "UNPAID");

  return {
    roleType: "accounts",
    cards: {
      totalPaymentsSubmitted: inPeriod.length,
      pendingVerification: countBy(inPeriod, isPendingPayment),
      verifiedPayments: countBy(inPeriod, isVerifiedPayment),
      rejectedPayments: countBy(inPeriod, (p) => p.status === "REJECTED"),
      todayCollection: sumBy(
        verified.filter((p) => dateOf(p.payment_date) === today),
        (p) => p.amount,
      ),
      thisMonthCollection: sumBy(
        verified.filter((p) => monthOf(p.payment_date) === thisMonth),
        (p) => p.amount,
      ),
      outstandingAmount: sumBy(activeOrders, (o) => o.pending_amount),
      fullyPaidOrders: fullyPaid,
      partiallyPaidOrders: partiallyPaid,
      unpaidOrders: unpaid,
      advanceHeld: advance.advanceHeld,
      advanceOrders: advance.advanceOrders,
      partyCredit: advance.partyCredit,
      partyCreditParties: advance.partyCreditParties,
      totalAdvance: advance.totalAdvance,
    },
    pendingVerificationList,
    recentPayments,
    paymentChart,
    paymentBreakdown: { fullyPaid, partiallyPaid, unpaid },
  };
}

// ---------------------------------------------------------------------------
// 4. ADMIN & SUPER ADMIN - MASTER DASHBOARD
// ---------------------------------------------------------------------------
async function adminDashboard({
  sDate,
  eDate,
  sales_person_id,
  vendor_id,
  order_status,
}) {
  const today = todayLocal();
  const thisMonth = today.slice(0, 7);
  const spId = isActive(sales_person_id) ? Number(sales_person_id) : null;
  const vId = isActive(vendor_id) ? Number(vendor_id) : null;
  const statusFilter = isActive(order_status) ? String(order_status) : null;

  const allOrders = await Order.rows({}, { select: ORDER_FIELDS });
  const orderById = new Map(allOrders.map((o) => [o.id, o]));

  const bySpVendor = (o) =>
    (spId === null || o.sales_person_id === spId) &&
    (vId === null || o.vendor_id === vId);
  const orders = allOrders.filter(
    (o) =>
      bySpVendor(o) &&
      (statusFilter === null || o.order_status === statusFilter) &&
      ((!sDate && !eDate) || localInRange(o.created_at, sDate, eDate)),
  );
  const active = orders.filter(notCancelled);
  const t = statusTotals(orders);

  // Today / this month sales ( respect sales person + party filter )
  const liveOrders = allOrders.filter((o) => notCancelled(o) && bySpVendor(o));
  const todaySales = sumBy(
    liveOrders.filter((o) => localDateOf(o.created_at) === today),
    (o) => o.grand_total,
  );
  const thisMonthSales = sumBy(
    liveOrders.filter((o) => localMonthOf(o.created_at) === thisMonth),
    (o) => o.grand_total,
  );

  const salesRole = await Role.row({ slug: "sales_person" });
  const [
    monthPayments,
    pendingVerification,
    totalVendors,
    totalProducts,
    activeUsers,
    salesUsers,
    refs,
    topProducts,
    activityRows,
  ] = await Promise.all([
    Payment.rows(
      addDateRange({}, "payment_date", `${thisMonth}-01`, `${thisMonth}-31`),
      {
        select: "order_id amount payment_date is_verified status",
      },
    ),
    Payment.countDocuments({
      is_verified: 0,
      status: { $in: [null, "PENDING_VERIFICATION"] },
    }),
    Vendor.countDocuments({ status: "active" }),
    Product.countDocuments({ status: "active" }),
    User.countDocuments({ status: "active" }),
    salesRole
      ? User.rows(
          { role_id: salesRole.id },
          { select: "id name employee_id status", sort: { name: 1 } },
        )
      : [],
    loadOrderRefs(orders),
    buildTopProducts(orders, 5),
    ActivityLog.rows({}, { sort: { id: -1 }, limit: 8 }),
  ]);

  // Collections ( verified payments; respect sales person filter )
  const collected = monthPayments.filter(
    (p) =>
      isVerifiedPayment(p) &&
      orderById.has(p.order_id) &&
      (spId === null || orderById.get(p.order_id).sales_person_id === spId),
  );
  const todayCollection = sumBy(
    collected.filter((p) => dateOf(p.payment_date) === today),
    (p) => p.amount,
  );
  const thisMonthCollection = sumBy(collected, (p) => p.amount);

  const paymentDistribution = {
    unpaid: countBy(active, (o) => o.payment_status === "UNPAID"),
    partiallyPaid: countBy(active, (o) =>
      ["PARTIALLY_PAID", "PARTIAL_PAYMENT", "ADVANCE_RECEIVED"].includes(
        o.payment_status,
      ),
    ),
    fullyPaid: countBy(active, (o) =>
      ["PAID", "FULLY_PAID"].includes(o.payment_status),
    ),
  };

  const packingMetrics = {
    pendingPacking: countBy(
      active,
      (o) =>
        o.packing_status === "PENDING_PACKING" ||
        (o.packing_status == null &&
          ["ACCEPTED", "PROCESSING"].includes(o.order_status)),
    ),
    inProgress: countBy(
      active,
      (o) =>
        o.packing_status === "IN_PROGRESS" ||
        o.production_status === "IN_PRODUCTION",
    ),
    packed: countBy(
      active,
      (o) =>
        o.packing_status === "PACKED" ||
        o.production_status === "PRODUCTION_COMPLETED",
    ),
    onHold: countBy(active, (o) => o.packing_status === "ON_HOLD"),
  };

  const dispatchMetrics = {
    readyDispatch: countBy(
      active,
      (o) => o.order_status === "READY_FOR_DISPATCH",
    ),
    outForDelivery: countBy(
      active,
      (o) => o.order_status === "OUT_FOR_DELIVERY",
    ),
  };

  // Sales person wise performance ( all sales persons, period filter only )
  const ordersBySp = groupBy(allOrders, (o) => o.sales_person_id);
  const salesPersonWiseSales = [];
  for (const u of salesUsers) {
    const mine = ordersBySp.get(u.id) || [];
    const inRange = mine.filter(
      (o) => (!sDate && !eDate) || localInRange(o.created_at, sDate, eDate),
    );
    if (mine.length && !inRange.length) continue;
    const live = inRange.filter(notCancelled);
    salesPersonWiseSales.push({
      id: u.id,
      name: u.name,
      employee_id: u.employee_id,
      total_orders: inRange.length,
      total_sales: sumBy(live, (o) => o.grand_total),
      total_received: sumBy(live, (o) => o.amount_received),
      pending_amount: sumBy(live, (o) => o.pending_amount),
    });
  }
  salesPersonWiseSales.sort((a, b) => b.total_sales - a.total_sales);

  const salesTrend = buildTrend(
    orders,
    isShortRange(sDate, eDate, 31),
    "period",
  ).slice(0, 15);
  const topVendors = buildTopVendors(orders, refs.vendors, 5);
  const recentOrders = await buildRecentOrders(orders, refs);

  // Recent activities
  const actUsers = await User.byIds(
    uniq(activityRows.map((a) => a.user_id)),
    "id name role_id",
  );
  const actRoles = await Role.byIds(
    uniq([...actUsers.values()].map((u) => u.role_id)),
    "id name",
  );
  const recentActivities = activityRows.map((a) => {
    const u = actUsers.get(a.user_id);
    return {
      ...a,
      user_name: u?.name ?? null,
      role_name: u ? (actRoles.get(u.role_id)?.name ?? null) : null,
    };
  });

  const vendorsList = await vendorOptions();
  const advance = await buildAdvanceStats(
    orders,
    vId === null ? {} : { id: vId },
    refs,
  );

  // Simple money split ( each order: paid part is capped at its own total )
  //   sales = paidForOrders + pending      ( paidForOrders includes advance )
  //   anything paid ABOVE an order total is "extra" and lives as party credit
  const paidForOrders = sumBy(active, (o) =>
    Math.min(o.amount_received || 0, o.grand_total || 0),
  );
  const unverifiedRows = await Payment.rows(
    { is_verified: 0, status: { $in: [null, "PENDING_VERIFICATION"] } },
    { select: "amount" },
  );
  const unverifiedAmount = sumBy(unverifiedRows, (p) => p.amount);
  const salesPersonsList = salesUsers.map((u) => ({ id: u.id, name: u.name }));

  // Clean 4-step pipeline: New -> Approved -> Packing -> Delivered
  const adminNewOrders = t.countsMap.NEW || 0;
  const adminApprovedOrders = t.countsMap.ACCEPTED || 0;
  const adminDeliveredOrders =
    (t.countsMap.DELIVERED || 0) + (t.countsMap.COMPLETED || 0);
  const adminCancelledOrders = t.countsMap.CANCELLED || 0;
  const adminPackingOrders = Math.max(
    0,
    t.total -
      adminNewOrders -
      adminApprovedOrders -
      adminDeliveredOrders -
      adminCancelledOrders,
  );

  return {
    roleType: "master_admin",
    categories: {
      orders: {
        totalOrders: t.total,
        newOrders: adminNewOrders,
        approvedOrders: adminApprovedOrders,
        packingOrders: adminPackingOrders,
        deliveredOrders: adminDeliveredOrders,
        cancelledOrders: adminCancelledOrders,
      },
      sales: {
        totalSalesValue: t.salesValue,
        todaySales,
        thisMonthSales,
        salesPersonWiseSales,
        topSalesPersons: salesPersonWiseSales.slice(0, 5),
        topParties: topVendors,
        topVendors,
        topProducts,
      },
      packing: {
        pendingPacking: packingMetrics.pendingPacking,
        packingInProgress: packingMetrics.inProgress,
        packed: packingMetrics.packed,
        delivered: adminDeliveredOrders,
        onHold: packingMetrics.onHold,
      },
      payments: {
        totalOrderValue: t.salesValue,
        verifiedReceived: t.received,
        balancePayment: t.pending,
        pendingAmount: t.pending,
        pendingVerification,
        todayCollection,
        thisMonthCollection,
        unpaidOrders: paymentDistribution.unpaid,
        partiallyPaidOrders: paymentDistribution.partiallyPaid,
        fullyPaidOrders: paymentDistribution.fullyPaid,
        advanceHeld: advance.advanceHeld,
        advanceOrders: advance.advanceOrders,
        partyCredit: advance.partyCredit,
        partyCreditParties: advance.partyCreditParties,
        totalAdvance: advance.totalAdvance,
        // --- simple money summary ---
        advanceList: advance.advanceList,
        creditList: advance.creditList,
        paidForOrders: Math.round(paidForOrders * 100) / 100,
        unverifiedAmount: Math.round(unverifiedAmount * 100) / 100,
      },
      business: {
        totalParties: totalVendors,
        totalVendors,
        totalProducts,
        activeSalesPersons: countBy(salesUsers, (u) => u.status === "active"),
        activeUsers,
      },
    },
    charts: {
      salesTrend,
      ordersByStatus: [
        {
          status: "NEW",
          label: "New",
          count: adminNewOrders,
          color: "#3b82f6",
        },
        {
          status: "ACCEPTED",
          label: "Approved",
          count: adminApprovedOrders,
          color: "#6366f1",
        },
        {
          status: "PROCESSING",
          label: "Packing",
          count: adminPackingOrders,
          color: "#f59e0b",
        },
        {
          status: "DELIVERED",
          label: "Delivered",
          count: adminDeliveredOrders,
          color: "#10b981",
        },
        {
          status: "CANCELLED",
          label: "Cancelled",
          count: adminCancelledOrders,
          color: "#ef4444",
        },
      ],
      receivedVsPending: {
        received: t.received,
        pending: t.pending,
        balance: t.pending,
        total: t.salesValue,
      },
      topProducts,
      topParties: topVendors,
      topVendors,
      salesPersonPerformance: salesPersonWiseSales,
    },
    recentOrders,
    recentActivities,
    filterOptions: {
      salesPersons: salesPersonsList,
      parties: vendorsList,
      vendors: vendorsList,
      statuses: [
        "ALL",
        "NEW",
        "ACCEPTED",
        "PROCESSING",
        "DELIVERED",
        "CANCELLED",
      ],
    },
    // Top-level aliases kept for backward compatibility
    kpis: {
      totalOrders: t.total,
      newOrders: adminNewOrders,
      acceptedOrders: adminApprovedOrders,
      processingOrders: adminPackingOrders,
      readyForDispatch: 0,
      outForDelivery: 0,
      deliveredOrders: adminDeliveredOrders,
      completedOrders: t.countsMap.COMPLETED || 0,
      cancelledOrders: adminCancelledOrders,
    },
    financial: {
      totalOrderValue: t.salesValue,
      totalAmountReceived: t.received,
      totalPendingAmount: t.pending,
      todayCollection,
      thisMonthCollection,
      periodCollection: thisMonthCollection,
      advanceHeld: advance.advanceHeld,
      partyCredit: advance.partyCredit,
      totalAdvance: advance.totalAdvance,
    },
    operational: {
      productionPending: packingMetrics.pendingPacking,
      dispatchPending: dispatchMetrics.readyDispatch,
      deliveryPending: dispatchMetrics.outForDelivery,
      paymentPending: paymentDistribution.unpaid,
    },
    monthlyData: salesTrend,
    topSalesPersons: salesPersonWiseSales.slice(0, 5),
  };
}

// GET /api/dashboard/stats  -> role based payload
exports.stats = async (req, res) => {
  const user = req.user;
  const roleSlug = user.role_slug || "";
  const isSuperAdmin = roleSlug === "super_admin";
  const isAdmin = roleSlug === "admin" || isSuperAdmin;
  const isSalesPerson = roleSlug === "sales_person";
  const isPacking = ["packing_team", "production_team"].includes(roleSlug);
  const isAccounts = roleSlug === "accounts";

  const {
    startDate,
    endDate,
    date_from,
    date_to,
    sales_person_id,
    vendor_id,
    order_status,
  } = req.query;
  const params = {
    sDate: startDate || date_from || undefined,
    eDate: endDate || date_to || undefined,
    sales_person_id,
    vendor_id,
    order_status,
  };

  if (
    isSalesPerson ||
    (!isAdmin &&
      !isPacking &&
      !isAccounts &&
      user.permissions.includes("orders:view_own"))
  ) {
    return res.json(await salesPersonDashboard(user, params));
  }
  if (
    isPacking ||
    (!isAdmin && !isAccounts && user.permissions.includes("packing:view"))
  ) {
    return res.json(await packingDashboard(params));
  }
  if (
    isAccounts ||
    (!isAdmin &&
      (user.permissions.includes("payments:verify") ||
        user.permissions.includes("payments:view")))
  ) {
    return res.json(await accountsDashboard(params));
  }
  return res.json(await adminDashboard(params));
};