const { Order, OrderItem, Vendor, User, Company, Dispatch } = require('../models');
const { addDateRange, sumBy, countBy, uniq, groupBy, toId } = require('../utils/helpers');
const { isActive } = require('../utils/queries');

const notCancelled = (o) => o.order_status !== 'CANCELLED';

const STATUS_LABEL = (s) => {
  if (s === 'NEW') return 'New';
  if (['ACCEPTED', 'APPROVED'].includes(s)) return 'Approved';
  if (['PROCESSING', 'PACKING', 'READY_FOR_DISPATCH'].includes(s)) return 'Packing';
  if (['DELIVERED', 'COMPLETED', 'OUT_FOR_DELIVERY'].includes(s)) return 'Delivered';
  if (s === 'CANCELLED') return 'Cancelled';
  return s;
};

// GET /api/reports/:type
exports.getReport = async (req, res) => {
  const user = req.user;
  const isSalesPerson = user.role_slug === 'sales_person';
  const { type } = req.params;
  const { company_id, sales_person_id, vendor_id, status, date_from, date_to } = req.query;

  const known = ['orders', 'sales-person', 'vendor', 'product', 'outstanding', 'dispatch'];
  if (!known.includes(type)) return res.status(400).json({ error: 'Unknown report type' });

  // ---- order filter ( strict data isolation for Sales Persons ) ----
  const and = [];
  if (isSalesPerson) {
    if (type === 'vendor') {
      const mine = await Vendor.rows({ assigned_sales_person_id: user.id }, { select: 'id' });
      and.push({ vendor_id: { $in: mine.map((v) => v.id) } });
    } else if (type !== 'product') {
      and.push({ sales_person_id: user.id });
    }
  } else if (isActive(sales_person_id)) {
    and.push({ sales_person_id: toId(sales_person_id) });
  }

  if (company_id) and.push({ company_id: toId(company_id) });
  if (isActive(vendor_id)) and.push({ vendor_id: toId(vendor_id) });
  if (isActive(status)) {
    if (status === 'APPROVED' || status === 'ACCEPTED') and.push({ order_status: { $in: ['ACCEPTED', 'APPROVED'] } });
    else if (status === 'PACKING' || status === 'PROCESSING') and.push({ order_status: { $in: ['PROCESSING', 'PACKING', 'READY_FOR_DISPATCH'] } });
    else if (status === 'DELIVERED') and.push({ order_status: { $in: ['DELIVERED', 'COMPLETED', 'OUT_FOR_DELIVERY'] } });
    else and.push({ order_status: String(status) });
  }
  if (date_from || date_to) and.push(addDateRange({}, 'created_at', date_from, date_to));

  const orders = await Order.rows(and.length ? { $and: and } : {}, { sort: { id: -1 } });
  const [vendors, users, companies] = await Promise.all([
    Vendor.byIds(uniq(orders.map((o) => o.vendor_id))),
    User.byIds(uniq(orders.map((o) => o.sales_person_id)), 'id name employee_id'),
    Company.byIds(uniq(orders.map((o) => o.company_id)), 'id name'),
  ]);
  const vendorName = (o) => vendors.get(o.vendor_id)?.company_name ?? null;
  const salesName = (o) => users.get(o.sales_person_id)?.name ?? null;
  const companyName = (o) => companies.get(o.company_id)?.name ?? null;

  if (type === 'orders') {
    const data = orders.map((o) => ({
      order_number: o.order_number,
      created_at: o.created_at,
      order_status: STATUS_LABEL(o.order_status),
      payment_status: o.payment_status,
      grand_total: o.grand_total,
      amount_received: o.amount_received,
      pending_amount: o.pending_amount,
      vendor_name: vendorName(o),
      sales_person_name: salesName(o),
      company_name: companyName(o),
    }));
    return res.json({ report: 'Order Master Report', data });
  }

  if (type === 'sales-person') {
    const data = [...groupBy(orders, (o) => o.sales_person_id).entries()]
      .filter(([id]) => users.has(id))
      .map(([id, list]) => {
        const live = list.filter(notCancelled);
        return {
          name: users.get(id).name,
          employee_id: users.get(id).employee_id,
          orders_count: list.length,
          total_sales: sumBy(live, (o) => o.grand_total),
          total_received: sumBy(live, (o) => o.amount_received),
          total_pending: sumBy(live, (o) => o.pending_amount),
          delivered_orders: countBy(list, (o) => ['DELIVERED', 'COMPLETED'].includes(o.order_status)),
        };
      })
      .sort((a, b) => b.total_sales - a.total_sales);
    return res.json({ report: 'Sales Person Performance Report', data });
  }

  if (type === 'vendor') {
    const assigned = await User.byIds(uniq([...vendors.values()].map((v) => v.assigned_sales_person_id)), 'id name');
    const data = [...groupBy(orders, (o) => o.vendor_id).entries()]
      .filter(([id]) => vendors.has(id))
      .map(([id, list]) => {
        const v = vendors.get(id);
        const live = list.filter(notCancelled);
        return {
          company_name: v.company_name,
          city: v.city,
          state: v.state,
          sales_person_name: assigned.get(v.assigned_sales_person_id)?.name ?? null,
          orders_count: list.length,
          total_order_value: sumBy(live, (o) => o.grand_total),
          total_received: sumBy(live, (o) => o.amount_received),
          total_pending: sumBy(live, (o) => o.pending_amount),
        };
      })
      .sort((a, b) => b.total_order_value - a.total_order_value);
    return res.json({ report: 'Vendor-wise Sales Analysis', data });
  }

  if (type === 'product') {
    const ids = orders.filter(notCancelled).map((o) => o.id);
    const items = ids.length
      ? await OrderItem.rows({ order_id: { $in: ids } }, { select: 'product_id sku product_name unit quantity line_amount rate' })
      : [];
    const data = [...groupBy(items, (i) => `${i.product_id}|${i.sku}`).values()]
      .map((list) => ({
        sku: list[0].sku,
        product_name: list[0].product_name,
        unit: list[0].unit,
        total_quantity: sumBy(list, (i) => i.quantity),
        total_sales_value: sumBy(list, (i) => i.line_amount),
        average_selling_rate: sumBy(list, (i) => i.rate) / list.length,
      }))
      .sort((a, b) => b.total_sales_value - a.total_sales_value);
    return res.json({ report: 'Product-wise Sales Analysis', data });
  }

  if (type === 'outstanding') {
    const data = orders
      .filter((o) => o.pending_amount > 0 && notCancelled(o))
      .sort((a, b) => b.pending_amount - a.pending_amount)
      .map((o) => ({
        order_number: o.order_number,
        created_at: o.created_at,
        grand_total: o.grand_total,
        amount_received: o.amount_received,
        pending_amount: o.pending_amount,
        order_status: o.order_status,
        vendor_name: vendorName(o),
        vendor_mobile: vendors.get(o.vendor_id)?.mobile ?? null,
        sales_person_name: salesName(o),
        company_name: companyName(o),
      }));
    return res.json({ report: 'Outstanding Payment Ledger', data });
  }

  // dispatch
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const dispatches = orders.length
    ? await Dispatch.rows({ order_id: { $in: orders.map((o) => o.id) } }, { sort: { id: -1 } })
    : [];
  const data = dispatches.map((d) => {
    const o = orderMap.get(d.order_id);
    return {
      dispatch_number: d.dispatch_number,
      dispatch_date: d.dispatch_date,
      transport_name: d.transport_name,
      vehicle_number: d.vehicle_number,
      lr_number: d.lr_number,
      dispatch_quantity: d.dispatch_quantity,
      order_number: o.order_number,
      vendor_name: vendorName(o),
      delivery_status: o.delivery_status,
    };
  });
  return res.json({ report: 'Dispatch & Fleet Logistics Report', data });
};
