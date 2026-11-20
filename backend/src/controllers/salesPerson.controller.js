// Sales persons: performance list + detailed profile
const { User, Role, Vendor, Order, OrderItem, Company, Product } = require('../models');
const { toId, dateOf, monthOf, addDateRange, sumBy, countBy, uniq, groupBy, isShortRange } = require('../utils/helpers');
const { loadItemsByOrder, DEFAULT_PRODUCT_IMAGE } = require('../utils/queries');
const { heldAdvanceByOrder } = require('../utils/advance');
const { round2 } = require('../utils/helpers');

const notCancelled = (o) => o.order_status !== 'CANCELLED';

exports.list = async (req, res) => {
  const user = req.user;
  const role = await Role.row({ slug: 'sales_person' });
  if (!role) return res.json({ salesPersons: [] });

  const filter = { role_id: role.id };
  if (user.role_slug === 'sales_person') filter.id = user.id;

  const users = await User.rows(filter, { select: 'id name email mobile employee_id avatar_url status' });
  const ids = users.map((u) => u.id);
  const [vendors, orders] = await Promise.all([
    Vendor.rows({ assigned_sales_person_id: { $in: ids } }, { select: 'assigned_sales_person_id' }),
    Order.rows({ sales_person_id: { $in: ids } }, { select: 'sales_person_id order_status grand_total amount_received pending_amount' }),
  ]);
  const vendorsBy = groupBy(vendors, (v) => v.assigned_sales_person_id);
  const ordersBy = groupBy(orders, (o) => o.sales_person_id);

  const salesPersons = users
    .map((u) => {
      const mine = ordersBy.get(u.id) || [];
      const live = mine.filter(notCancelled);
      return {
        ...u,
        vendor_count: (vendorsBy.get(u.id) || []).length,
        total_orders: mine.length,
        total_sales: sumBy(live, (o) => o.grand_total),
        total_received: sumBy(live, (o) => o.amount_received),
        total_pending: sumBy(live, (o) => o.pending_amount),
      };
    })
    .sort((a, b) => b.total_sales - a.total_sales);

  res.json({ salesPersons });
};

// Preset period -> { sDate, eDate } ( server local time, same as before )
function resolvePeriod(period) {
  const ref = new Date();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const monday = () => {
    const day = ref.getDay();
    const mon = new Date(ref);
    mon.setDate(ref.getDate() + (day === 0 ? -6 : 1 - day));
    return mon;
  };

  switch (period) {
    case 'today':
      return [ymd(ref), ymd(ref)];
    case 'yesterday': {
      const y = new Date(ref);
      y.setDate(ref.getDate() - 1);
      return [ymd(y), ymd(y)];
    }
    case 'this_week': {
      const mon = monday();
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return [ymd(mon), ymd(sun)];
    }
    case 'last_week': {
      const lastMon = monday();
      lastMon.setDate(lastMon.getDate() - 7);
      const lastSun = new Date(lastMon);
      lastSun.setDate(lastMon.getDate() + 6);
      return [ymd(lastMon), ymd(lastSun)];
    }
    case 'this_month':
      return [ymd(new Date(ref.getFullYear(), ref.getMonth(), 1)), ymd(new Date(ref.getFullYear(), ref.getMonth() + 1, 0))];
    case 'last_month':
      return [ymd(new Date(ref.getFullYear(), ref.getMonth() - 1, 1)), ymd(new Date(ref.getFullYear(), ref.getMonth(), 0))];
    case 'this_year':
      return [ymd(new Date(ref.getFullYear(), 0, 1)), ymd(new Date(ref.getFullYear(), 11, 31))];
    default:
      return [undefined, undefined];
  }
}

exports.getOne = async (req, res) => {
  const user = req.user;
  const id = toId(req.params.id);
  const { period, startDate, endDate, date_from, date_to } = req.query;

  // A Sales Person cannot view another Sales Person's profile
  if (user.role_slug === 'sales_person' && id !== user.id) {
    return res.status(403).json({ error: 'Forbidden: Access denied. You can only view your own sales performance profile.' });
  }

  const u = id === null ? null : await User.row({ id });
  const role = u ? await Role.row({ id: u.role_id }, { select: 'name' }) : null;
  if (!u || !role) return res.status(404).json({ error: 'Sales person not found' });
  const { password_hash, ...safeUser } = u; // never expose the hash
  const person = { ...safeUser, role_name: role.name };

  let sDate = startDate || date_from || undefined;
  let eDate = endDate || date_to || undefined;
  if (!sDate && !eDate && period) [sDate, eDate] = resolvePeriod(period);

  const ordersRaw = await Order.rows(addDateRange({ sales_person_id: id }, 'created_at', sDate, eDate), { sort: { id: -1 } });
  const live = ordersRaw.filter(notCancelled);

  const [vendorMap, companyMap, itemsMap, parties] = await Promise.all([
    Vendor.byIds(uniq(ordersRaw.map((o) => o.vendor_id))),
    Company.byIds(uniq(ordersRaw.map((o) => o.company_id)), 'id name'),
    loadItemsByOrder(ordersRaw.map((o) => o.id)),
    Vendor.rows({ assigned_sales_person_id: id }, { sort: { company_name: 1 } }),
  ]);
  const allItems = [...itemsMap.values()].flat();
  const products = await Product.byIds(uniq(allItems.map((i) => i.product_id)), 'id image_url');
  const imageOf = (i) => products.get(i.product_id)?.image_url ?? DEFAULT_PRODUCT_IMAGE(80);

  // Advance: held on open orders + party credit ( saved extra cash ) of this person's parties
  const heldByOrder = await heldAdvanceByOrder(live);
  const heldByParty = new Map();
  for (const o of live) heldByParty.set(o.vendor_id, round2((heldByParty.get(o.vendor_id) || 0) + (heldByOrder.get(o.id) || 0)));
  const creditByParty = new Map(parties.map((p) => [p.id, round2(p.credit_balance || 0)]));
  for (const v of vendorMap.values()) if (!creditByParty.has(v.id)) creditByParty.set(v.id, round2(v.credit_balance || 0));
  const advanceHeld = round2([...heldByOrder.values()].reduce((a, b) => a + b, 0));
  const partyCredit = round2([...creditByParty.values()].reduce((a, b) => a + b, 0));

  const has = ordersRaw.length > 0;
  const count = (fn) => (has ? countBy(ordersRaw, fn) : null);
  const metrics = {
    total_orders: ordersRaw.length,
    total_order_value: sumBy(live, (o) => o.grand_total),
    amount_received: sumBy(live, (o) => o.amount_received),
    pending_amount: sumBy(live, (o) => o.pending_amount),
    advance_held: advanceHeld,
    party_credit: partyCredit,
    total_advance: round2(advanceHeld + partyCredit),
    new_orders: count((o) => o.order_status === 'NEW'),
    approved_orders: count((o) => o.order_status === 'ACCEPTED'),
    packing_orders: count(
      (o) =>
        o.order_status === 'PROCESSING' ||
        (['PENDING_PACKING', 'IN_PROGRESS', 'PACKING_IN_PROGRESS', 'PACKED'].includes(o.packing_status) &&
          !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(o.order_status))
    ),
    delivered_orders: count((o) => o.order_status === 'DELIVERED' || o.delivery_status === 'DELIVERED'),
    cancelled_orders: count((o) => o.order_status === 'CANCELLED'),
    active_parties_in_period: uniq(ordersRaw.map((o) => o.vendor_id)).length,
  };

  const orders = ordersRaw
    .filter((o) => vendorMap.has(o.vendor_id))
    .map((o) => {
      const v = vendorMap.get(o.vendor_id);
      return {
        ...o,
        vendor_name: v.company_name,
        party_name: v.company_name,
        vendor_city: v.city,
        company_name: companyMap.get(o.company_id)?.name ?? null,
        items: (itemsMap.get(o.id) || []).map((i) => ({
          id: i.id, product_id: i.product_id, product_name: i.product_name, sku: i.sku, quantity: i.quantity,
          unit: i.unit, rate: i.rate, line_amount: i.line_amount, product_image: imageOf(i),
        })),
      };
    });

  // Top products ( non cancelled orders )
  const liveIds = new Set(live.map((o) => o.id));
  const topProducts = [...groupBy(allItems.filter((i) => liveIds.has(i.order_id)), (i) => `${i.product_id}|${i.sku}`).values()]
    .map((list) => ({
      product_name: list[0].product_name,
      sku: list[0].sku,
      unit: list[0].unit,
      product_image: imageOf(list[0]),
      total_qty: sumBy(list, (i) => i.quantity),
      total_amount: sumBy(list, (i) => i.line_amount),
    }))
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 10);

  // Top parties
  const topParties = [...groupBy(ordersRaw, (o) => o.vendor_id).entries()]
    .filter(([vendorId]) => vendorMap.has(vendorId))
    .map(([vendorId, list]) => {
      const v = vendorMap.get(vendorId);
      const liveList = list.filter(notCancelled);
      return {
        id: v.id,
        company_name: v.company_name,
        party_name: v.company_name,
        city: v.city,
        order_count: list.length,
        total_spent: sumBy(liveList, (o) => o.grand_total),
        total_received: sumBy(liveList, (o) => o.amount_received),
        balance_payment: sumBy(liveList, (o) => o.pending_amount),
        advance_held: heldByParty.get(v.id) || 0,
        party_credit: creditByParty.get(v.id) || 0,
        total_advance: round2((heldByParty.get(v.id) || 0) + (creditByParty.get(v.id) || 0)),
      };
    })
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, 10);

  // Sales trend ( daily for short ranges, otherwise monthly )
  const short = isShortRange(sDate, eDate, 35);
  const salesTrend = [...groupBy(ordersRaw, (o) => (short ? dateOf(o.created_at) : monthOf(o.created_at))).entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => {
      const liveList = list.filter(notCancelled);
      return {
        period: key,
        orders_count: list.length,
        total_sales: sumBy(liveList, (o) => o.grand_total),
        total_received: sumBy(liveList, (o) => o.amount_received),
        balance_payment: sumBy(liveList, (o) => o.pending_amount),
      };
    });

  const partyRows = parties.map((p) => ({ ...p, party_name: p.company_name }));

  res.json({
    person,
    metrics: {
      ...metrics,
      party_count: metrics.active_parties_in_period || 0,
      total_assigned_parties: parties.length || 0,
    },
    orders,
    parties: partyRows,
    vendors: partyRows,
    topProducts,
    topParties,
    topVendors: topParties,
    salesTrend,
    dateRange: { startDate: sDate || '', endDate: eDate || '' },
  });
};
