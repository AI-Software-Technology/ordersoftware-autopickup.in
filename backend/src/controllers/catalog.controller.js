// Brands, Categories & Products
const { Brand, Category, Product, Order, OrderItem } = require('../models');
const FIELD_FOR = { Brand: 'brand_id', Category: 'category_id' };
const { logActivity } = require('../utils/audit');
const { toId, like, uniq } = require('../utils/helpers');
const { resolveFileInput, deleteUploaded } = require('../utils/uploads');

// ----------------------------- BRANDS & CATEGORIES -----------------------------
const masterHandlers = (Model, label, key) => ({
  list: async (_req, res) => {
    const rows = await Model.rows({}, { sort: { name: 1 } });
    res.json({ [key]: rows });
  },
  create: async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: `${label} name is required` });
    if (await Model.exists({ name })) return res.status(400).json({ error: `${label} already exists` });

    const row = await Model.insert({ name, description: description || '' });
    await logActivity(req.user.id, `${label.toUpperCase()}_CREATED`, label.toLowerCase(), row.id, `Created ${label.toLowerCase()} ${name}`);
    res.json({ id: row.id, message: `${label} added successfully` });
  },
  update: async (req, res) => {
    const { name, description, status } = req.body;
    await Model.updateOne({ id: toId(req.params.id) }, { $set: { name, description, status: status || 'active' } });
    res.json({ message: `${label} updated` });
  },
  // Delete only when no product uses it (otherwise those products would lose their brand / category)
  remove: async (req, res) => {
    const id = toId(req.params.id);
    const row = id === null ? null : await Model.row({ id });
    if (!row) return res.status(404).json({ error: `${label} not found` });

    const inUse = await Product.countDocuments({ [FIELD_FOR[label]]: id });
    if (inUse > 0) {
      return res.status(400).json({
        error: `Cannot delete ${label.toLowerCase()} "${row.name}": ${inUse} product(s) use it. Move or delete those products first, or mark it Inactive.`,
      });
    }
    await Model.deleteOne({ id });
    await logActivity(req.user.id, `${label.toUpperCase()}_DELETED`, label.toLowerCase(), id, `Deleted ${label.toLowerCase()} ${row.name}`);
    res.json({ message: `${label} deleted` });
  },
});

exports.brands = masterHandlers(Brand, 'Brand', 'brands');
exports.categories = masterHandlers(Category, 'Category', 'categories');

// ----------------------------- PRODUCTS -----------------------------
exports.listProducts = async (req, res) => {
  const { category_id, brand_id, search } = req.query;
  const [brands, categories] = await Promise.all([
    Brand.rows({}, { select: 'id name' }),
    Category.rows({}, { select: 'id name' }),
  ]);
  const brandMap = new Map(brands.map((b) => [b.id, b.name]));
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const filter = {};
  if (category_id) filter.category_id = Number(category_id);
  if (brand_id) filter.brand_id = Number(brand_id);
  if (search) {
    const rx = like(search);
    filter.$or = [
      { name: rx },
      { sku: rx },
      { item_colour: rx },
      { brand_id: { $in: brands.filter((b) => rx.test(b.name)).map((b) => b.id) } },
      { category_id: { $in: categories.filter((c) => rx.test(c.name)).map((c) => c.id) } },
    ];
  }

  const rows = await Product.rows(filter, { sort: { name: 1 } });
  const products = rows
    .filter((p) => brandMap.has(p.brand_id) && catMap.has(p.category_id))
    .map((p) => ({ ...p, brand_name: brandMap.get(p.brand_id), category_name: catMap.get(p.category_id) }));
  res.json({ products });
};

// Last rate at which this party bought this product
exports.vendorLastRate = async (req, res) => {
  const vendorId = toId(req.query.vendor_id);
  const productId = toId(req.query.product_id);
  if (!vendorId || !productId) return res.json({ lastRate: null });

  const items = await OrderItem.rows({ product_id: productId }, { select: 'order_id rate' });
  if (!items.length) return res.json({ lastRate: null });

  const order = await Order.row(
    { id: { $in: uniq(items.map((i) => i.order_id)) }, vendor_id: vendorId, order_status: { $ne: 'CANCELLED' } },
    { select: 'id order_number created_at', sort: { id: -1 } }
  );
  if (!order) return res.json({ lastRate: null });

  const item = items.find((i) => i.order_id === order.id);
  res.json({ lastRate: item ? item.rate : null, lastOrder: order.order_number, date: order.created_at });
};

exports.createProduct = async (req, res) => {
  const { name, brand_id, category_id, unit, standard_rate, description, image_url, item_colour, status } = req.body;
  const cleanUnit = (unit || '').toString().trim();
  if (!name || !brand_id || !category_id || !cleanUnit) {
    return res.status(400).json({ error: 'Name, Brand, Category, and Packing Unit are required' });
  }

  const nextSku = async () => {
    const all = await Product.rows({}, { select: 'sku' });
    const maxSku = all.reduce((m, p) => Math.max(m, parseInt(p.sku, 10) || 0), 0);
    return String(maxSku + 1).padStart(3, '0');
  };

  const isDupSku = (e) =>
    /duplicate/i.test(e?.message || '') && /sku/i.test(e?.message || '') ||
    e?.code === 'ER_DUP_ENTRY' || e?.code === 11000 || e?.name === 'SequelizeUniqueConstraintError';

  // base64 upload -> file on disk, DB keeps only the path
  const imagePath = await resolveFileInput(image_url || '', 'products', req);

  let product, sku;
  for (let attempt = 0; attempt < 5; attempt++) {
    sku = await nextSku();
    try {
      product = await Product.insert({
        sku,
        name, brand_id: Number(brand_id), category_id: Number(category_id), unit: cleanUnit,
        min_order_qty: 1, standard_rate: Number(standard_rate) || 0,
        description: description || '', image_url: imagePath || '',
        item_colour: item_colour || 'Golden Yellow', status: status || 'active',
      });
      break;
    } catch (e) {
      if (!isDupSku(e) || attempt === 4) {
        await deleteUploaded(imagePath);
        return res.status(isDupSku(e) ? 409 : 500).json({ error: e.message });
      }
    }
  }

  await logActivity(req.user.id, 'PRODUCT_CREATED', 'product', sku, `Added new product ${name} (${sku}) with packing unit ${cleanUnit}`);
  res.json({ id: product.id, sku, message: 'Product created successfully' });
};

exports.updateProduct = async (req, res) => {
  const id = toId(req.params.id);
  const { name, brand_id, category_id, unit, standard_rate, description, image_url, item_colour, status } = req.body;
  const cleanUnit = (unit || '').toString().trim();
  if (!cleanUnit) return res.status(400).json({ error: 'Packing Unit is required' });

  const existing = id === null ? null : await Product.row({ id }, { select: 'image_url' });
  // base64 upload -> file on disk, DB keeps only the path
  const imagePath = await resolveFileInput(image_url, 'products', req);

  await Product.updateOne(
    { id },
    {
      $set: {
        name, brand_id: Number(brand_id), category_id: Number(category_id), unit: cleanUnit,
        standard_rate: standard_rate === undefined || standard_rate === null || standard_rate === '' ? null : Number(standard_rate),
        description, image_url: imagePath, item_colour: item_colour || 'Golden Yellow', status: status || 'active',
      },
    }
  );

  // old file is no longer referenced -> remove from disk
  if (existing?.image_url && imagePath !== undefined && existing.image_url !== imagePath) {
    await deleteUploaded(existing.image_url);
  }

  await logActivity(req.user.id, 'PRODUCT_UPDATED', 'product', req.params.id, `Updated product specs for ${name} (Packing Unit: ${cleanUnit})`);
  res.json({ message: 'Product updated successfully' });
};

// Delete a product only if it was never ordered (order history must keep its product lines)
exports.deleteProduct = async (req, res) => {
  const id = toId(req.params.id);
  const product = id === null ? null : await Product.row({ id });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const used = await OrderItem.countDocuments({ product_id: id });
  if (used > 0) {
    return res.status(400).json({
      error: `Cannot delete "${product.name}": it is used in ${used} order line(s). Set the product to Inactive instead.`,
    });
  }
  await Product.deleteOne({ id });
  await deleteUploaded(product.image_url);
  await logActivity(req.user.id, 'PRODUCT_DELETED', 'product', product.sku, `Deleted product ${product.name} (${product.sku})`);
  res.json({ message: 'Product deleted successfully' });
};
