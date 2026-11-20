// Parties ( vendors ). Sales Person sees ONLY assigned parties, Admin sees all.
const { Vendor, User, Order, Company, Product } = require('../models');
const { logActivity } = require('../utils/audit');
const { toId, like, sumBy, countBy, uniq, groupBy } = require('../utils/helpers');
const { loadItemsByOrder, DEFAULT_PRODUCT_IMAGE } = require('../utils/queries');

const notCancelled = (o) => o.order_status !== 'CANCELLED';
const trimOrNull = (v) => (v ? String(v).trim() : null);

async function withUserNames(vendors, { mobile = false } = {}) {
  const users = await User.byIds(
    uniq(vendors.flatMap((v) => [v.assigned_sales_person_id, v.created_by_id, v.updated_by_id])),
    'id name mobile'
  );
  return vendors.map((v) => ({
    ...v,
    sales_person_name: users.get(v.assigned_sales_person_id)?.name ?? null,
    ...(mobile ? { sales_person_mobile: users.get(v.assigned_sales_person_id)?.mobile ?? null } : {}),
    created_by_name: users.get(v.created_by_id)?.name ?? null,
    updated_by_name: users.get(v.updated_by_id)?.name ?? null,
  }));
}

exports.list = async (req, res) => {
  const user = req.user;
  const { search, city, state, sales_person_id, status } = req.query;
  const filter = {};

  // Security Rule: Sales Person can ONLY see their own parties
  if (user.role_slug === 'sales_person') filter.assigned_sales_person_id = user.id;
  else if (sales_person_id) filter.assigned_sales_person_id = Number(sales_person_id);

  // Active / inactive totals for the parties this user may see (ignores search / status filters)
  const scope = { ...filter };
  const [totalCount, inactiveCount] = await Promise.all([
    Vendor.countDocuments(scope),
    Vendor.countDocuments({ ...scope, status: 'inactive' }),
  ]);
  const counts = { total: totalCount, active: totalCount - inactiveCount, inactive: inactiveCount };

  // ?status=active | inactive  (anything else = all). Old rows without a status count as active.
  if (status === 'active') filter.status = { $ne: 'inactive' };
  else if (status === 'inactive') filter.status = 'inactive';

  if (search) {
    const rx = like(search);
    filter.$or = [{ company_name: rx }, { contact_person: rx }, { vendor_code: rx }, { mobile: rx }];
  }
  if (city) filter.city = city;
  if (state) filter.state = state;

  const rows = await Vendor.rows(filter, { sort: { company_name: 1 } });
  const orders = rows.length
    ? await Order.rows(
        { vendor_id: { $in: rows.map((v) => v.id) } },
        { select: 'vendor_id order_status grand_total amount_received pending_amount' }
      )
    : [];
  const byVendor = groupBy(orders, (o) => o.vendor_id);

  const vendors = (await withUserNames(rows)).map((v) => {
    const list = byVendor.get(v.id) || [];
    const live = list.filter(notCancelled);
    return {
      ...v,
      total_orders: list.length,
      total_order_value: sumBy(live, (o) => o.grand_total),
      amount_received: sumBy(live, (o) => o.amount_received),
      pending_amount: sumBy(live, (o) => o.pending_amount),
    };
  });
  res.json({ vendors, counts });
};

exports.getOne = async (req, res) => {
  const user = req.user;
  const id = toId(req.params.id);

  const row = id === null ? null : await Vendor.row({ id });
  if (!row) return res.status(404).json({ error: 'Vendor not found' });

  if (user.role_slug === 'sales_person' && row.assigned_sales_person_id !== user.id) {
    return res.status(403).json({ error: 'Access denied: You can only view your own vendors' });
  }
  const [vendor] = await withUserNames([row], { mobile: true });

  // Order history
  const ordersRaw = await Order.rows(
    { vendor_id: id },
    {
      select: 'id order_number order_status grand_total amount_received pending_amount created_at required_delivery_date company_id',
      sort: { id: -1 },
    }
  );
  const [companies, itemsMap] = await Promise.all([
    Company.byIds(uniq(ordersRaw.map((o) => o.company_id)), 'id name'),
    loadItemsByOrder(ordersRaw.map((o) => o.id)),
  ]);
  const products = await Product.byIds(uniq([...itemsMap.values()].flat().map((i) => i.product_id)), 'id image_url');

  const orders = ordersRaw.map(({ company_id, ...o }) => ({
    ...o,
    company_name: companies.get(company_id)?.name ?? null,
    items: (itemsMap.get(o.id) || []).map((i) => ({
      id: i.id, product_id: i.product_id, product_name: i.product_name, sku: i.sku, quantity: i.quantity, unit: i.unit,
      product_image: products.get(i.product_id)?.image_url ?? DEFAULT_PRODUCT_IMAGE(80),
    })),
  }));

  const live = ordersRaw.filter(notCancelled);
  const summary = {
    total_orders: ordersRaw.length,
    total_value: ordersRaw.length ? sumBy(live, (o) => o.grand_total) : null,
    total_received: ordersRaw.length ? sumBy(live, (o) => o.amount_received) : null,
    total_pending: ordersRaw.length ? sumBy(live, (o) => o.pending_amount) : null,
    delivered_orders: ordersRaw.length ? countBy(ordersRaw, (o) => ['DELIVERED', 'COMPLETED'].includes(o.order_status)) : null,
    pending_orders: ordersRaw.length
      ? countBy(ordersRaw, (o) => ['NEW', 'ACCEPTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY'].includes(o.order_status))
      : null,
  };

  res.json({ vendor, orders, summary });
};

exports.create = async (req, res) => {
  const user = req.user;
  const {
    company_name, contact_person, mobile, alt_mobile, email, gstin, aadhaar_no,
    billing_address, delivery_address, city, state, pincode, assigned_sales_person_id, notes,
  } = req.body;

  if (!company_name || !billing_address || !city || !state) {
    return res.status(400).json({ error: 'Party Name, Address, City and State are required' });
  }

  // Contact person is removed from UI; default to party name if not provided
  const finalContact = (contact_person && String(contact_person).trim()) || String(company_name).trim();
  // Sales person always gets the party assigned to self
  const assignedSalesId = user.role_slug === 'sales_person' ? user.id : toId(assigned_sales_person_id) || user.id;

  const id = await Vendor.nextId();
  const vendorCode = `PTY-${2000 + id}`;

  const vendor = await Vendor.insert({
    id,
    vendor_code: vendorCode,
    company_name: String(company_name).trim(),
    contact_person: finalContact,
    mobile: mobile ? String(mobile).trim() : '',
    alt_mobile: trimOrNull(alt_mobile),
    email: trimOrNull(email),
    gstin: gstin ? String(gstin).trim().toUpperCase() : null,
    aadhaar_no: trimOrNull(aadhaar_no),
    billing_address: String(billing_address).trim(),
    delivery_address: delivery_address ? String(delivery_address).trim() : String(billing_address).trim(),
    city: String(city).trim(),
    state: String(state).trim(),
    pincode: trimOrNull(pincode),
    assigned_sales_person_id: assignedSalesId,
    created_by_id: user.id,
    notes: trimOrNull(notes),
  });

  await logActivity(user.id, 'PARTY_CREATED', 'party', vendorCode, `${user.name} created party ${company_name} (${vendorCode})`);
  res.json({ vendor, party: vendor, message: 'Party profile created successfully' });
};

exports.update = async (req, res) => {
  const user = req.user;
  const id = toId(req.params.id);

  const hasEditPerm = user.role_slug === 'super_admin' || user.permissions.includes('vendors:edit');
  if (!hasEditPerm) {
    return res.status(403).json({ error: 'Access denied: Missing party edit permission' });
  }

  const existing = id === null ? null : await Vendor.row({ id });
  if (!existing) return res.status(404).json({ error: 'Party not found' });

  // Sales Person can ONLY edit their own assigned parties
  if (user.role_slug === 'sales_person' && existing.assigned_sales_person_id !== user.id) {
    return res.status(403).json({ error: 'Access denied: You can only edit your own assigned parties' });
  }

  const {
    company_name, contact_person, mobile, alt_mobile, email, gstin, aadhaar_no,
    billing_address, delivery_address, city, state, pincode, assigned_sales_person_id, status, notes,
  } = req.body;

  if (!company_name || !billing_address || !city || !state) {
    return res.status(400).json({ error: 'Party Name, Billing Address, City and State are required' });
  }

  const finalContact = (contact_person && String(contact_person).trim()) || existing.contact_person || String(company_name).trim();
  // Sales Person cannot reassign; Admin / Super Admin can
  const salesId =
    user.role_slug === 'sales_person'
      ? existing.assigned_sales_person_id
      : toId(assigned_sales_person_id) || existing.assigned_sales_person_id;

  await Vendor.updateOne(
    { id },
    {
      $set: {
        company_name: String(company_name).trim(),
        contact_person: finalContact,
        mobile: mobile ? String(mobile).trim() : '',
        alt_mobile: trimOrNull(alt_mobile),
        email: trimOrNull(email),
        gstin: gstin ? String(gstin).trim().toUpperCase() : null,
        aadhaar_no: aadhaar_no !== undefined ? trimOrNull(aadhaar_no) : existing.aadhaar_no || null,
        billing_address: String(billing_address).trim(),
        delivery_address: delivery_address ? String(delivery_address).trim() : String(billing_address).trim(),
        city: String(city).trim(),
        state: String(state).trim(),
        pincode: trimOrNull(pincode),
        assigned_sales_person_id: salesId,
        status: status || existing.status || 'active',
        notes: notes !== undefined ? trimOrNull(notes) : existing.notes,
        updated_by_id: user.id,
        updated_at: new Date().toISOString(),
      },
    }
  );

  await logActivity(
    user.id, 'PARTY_PROFILE_UPDATED', 'party', existing.vendor_code,
    `${user.name} updated profile for party ${String(company_name).trim()} (${existing.vendor_code})`
  );

  const [updatedVendor] = await withUserNames([await Vendor.row({ id })], { mobile: true });
  return res.json({ vendor: updatedVendor, party: updatedVendor, message: 'Party profile updated successfully.' });
};
