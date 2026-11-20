// Reusable data-access helpers ( the "JOIN" layer on top of the collections )
const { User, Role, Vendor, Company, Product, Brand, Category, OrderItem } = require('../models');
const { uniq, toId, sumBy, like } = require('./helpers');

const DEFAULT_PRODUCT_IMAGE = (w) =>
  `https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=${w}&auto=format&fit=crop&q=80`;

// vendors / sales persons / companies referenced by a list of orders
async function loadOrderRefs(orders, { companies = true } = {}) {
  const [vendors, users, comps] = await Promise.all([
    Vendor.byIds(uniq(orders.map((o) => o.vendor_id))),
    User.byIds(uniq(orders.map((o) => o.sales_person_id)), 'id name email mobile employee_id'),
    companies ? Company.byIds(uniq(orders.map((o) => o.company_id))) : Promise.resolve(new Map()),
  ]);
  return { vendors, users, companies: comps };
}

// Map(order_id -> items[]) ordered by item id
async function loadItemsByOrder(orderIds) {
  const map = new Map();
  const ids = uniq(orderIds);
  if (!ids.length) return map;
  const items = await OrderItem.rows({ order_id: { $in: ids } }, { sort: { id: 1 } });
  for (const it of items) {
    if (!map.has(it.order_id)) map.set(it.order_id, []);
    map.get(it.order_id).push(it);
  }
  return map;
}

// Map(product_id -> product + brand_name + category_name)
async function loadProductsFor(items, { withBrand = false } = {}) {
  const products = await Product.byIds(uniq(items.map((i) => i.product_id)));
  if (withBrand && products.size) {
    const list = [...products.values()];
    const [brands, cats] = await Promise.all([
      Brand.byIds(uniq(list.map((p) => p.brand_id)), 'id name'),
      Category.byIds(uniq(list.map((p) => p.category_id)), 'id name'),
    ]);
    for (const p of list) {
      p.brand_name = brands.get(p.brand_id)?.name ?? null;
      p.category_name = cats.get(p.category_id)?.name ?? null;
    }
  }
  return products;
}

// item_count / totals / "first two products" summary for an order row
function summarizeItems(items = []) {
  return {
    item_count: items.length,
    total_quantity: items.length ? sumBy(items, (i) => i.quantity) : null,
    total_produced: items.length ? sumBy(items, (i) => i.produced_quantity) : null,
    total_dispatched: items.length ? sumBy(items, (i) => i.dispatched_quantity) : null,
    total_delivered: items.length ? sumBy(items, (i) => i.delivered_quantity) : null,
    products_summary: items.length
      ? items.slice(0, 2).map((i) => `${i.product_name} – ${i.unit}`).join(', ')
      : null,
  };
}

// Filter value may be a numeric id OR an exact name ( "o.vendor_id = ? OR v.company_name = ?" )
async function resolveIdsByIdOrName(Model, nameField, value) {
  const ids = new Set();
  const n = toId(value);
  if (n !== null) ids.add(n);
  const rows = await Model.rows({ [nameField]: String(value) }, { select: 'id' });
  rows.forEach((r) => ids.add(r.id));
  return [...ids];
}

async function idsMatching(Model, fields, term) {
  const rx = like(term);
  const rows = await Model.rows({ $or: fields.map((f) => ({ [f]: rx })) }, { select: 'id' });
  return rows.map((r) => r.id);
}

async function getRoleBySlug(slug) {
  return Role.row({ slug });
}

// Users having the "sales_person" role
async function getSalesPersonUsers(select = 'id name') {
  const role = await getRoleBySlug('sales_person');
  if (!role) return [];
  return User.rows({ role_id: role.id }, { select, sort: { name: 1 } });
}

const isActive = (v) => v !== undefined && v !== null && v !== '' && v !== 'ALL';

module.exports = {
  DEFAULT_PRODUCT_IMAGE, loadOrderRefs, loadItemsByOrder, loadProductsFor, summarizeItems,
  resolveIdsByIdOrName, idsMatching, getRoleBySlug, getSalesPersonUsers, isActive,
};
