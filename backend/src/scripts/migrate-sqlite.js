/**
 * One-time import of the OLD SQLite database ( data/lubricant_erp.db ) into MongoDB.
 * All numeric ids are preserved, so orders / payments / parties keep their numbers.
 *
 * Usage:
 *   npm run migrate:sqlite -- /path/to/lubricant_erp.db            ( refuses if MongoDB already has data )
 *   npm run migrate:sqlite -- /path/to/lubricant_erp.db --force    ( wipes MongoDB collections first )
 *
 * Needs Node.js 22.5+ ( built-in node:sqlite ) or `npm i better-sqlite3`.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { connectDB, disconnectDB } = require('../config/db');
const models = require('../models');
const { ensurePermissions } = require('../seed/permissions');

function openSqlite(file) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(file);
    return { all: (sql) => db.prepare(sql).all().map((r) => ({ ...r })), close: () => db.close() };
  } catch (e) {
    try {
      // eslint-disable-next-line import/no-unresolved, global-require
      const Database = require('better-sqlite3');
      const db = new Database(file, { readonly: true });
      return { all: (sql) => db.prepare(sql).all(), close: () => db.close() };
    } catch {
      throw new Error('No SQLite driver found. Use Node.js 22.5+ or run: npm i better-sqlite3');
    }
  }
}

// table -> model ( plain 1:1 copies )
const TABLES = [
  ['permissions', 'Permission'], ['users', 'User'], ['companies', 'Company'], ['brands', 'Brand'],
  ['categories', 'Category'], ['products', 'Product'], ['vendors', 'Vendor'], ['orders', 'Order'],
  ['order_items', 'OrderItem'], ['production_records', 'ProductionRecord'], ['payments', 'Payment'],
  ['order_status_history', 'OrderStatusHistory'], ['activity_logs', 'ActivityLog'], ['notifications', 'Notification'],
];

const clean = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
};

async function insertChunks(Model, rows) {
  for (let i = 0; i < rows.length; i += 500) await Model.insertMany(rows.slice(i, i + 500));
}

(async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const file = path.resolve(args.find((a) => !a.startsWith('--')) || './lubricant_erp.db');
  if (!fs.existsSync(file)) throw new Error(`SQLite file not found: ${file}`);

  await connectDB();
  const existingUsers = await models.User.countDocuments({});
  if (existingUsers > 0 && !force) {
    throw new Error('MongoDB already contains data. Re-run with --force to replace it.');
  }

  const sqlite = openSqlite(file);
  const tableNames = new Set(sqlite.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name));
  const read = (table) => (tableNames.has(table) ? sqlite.all(`SELECT * FROM ${table}`).map(clean) : []);

  console.log(`Importing ${file} ...`);
  for (const name of Object.keys(models)) {
    if (models[name] && typeof models[name].deleteMany === 'function') await models[name].deleteMany({});
  }

  // roles + role_permissions -> Role.permission_ids
  const rolePerms = read('role_permissions');
  const roles = read('roles').map((r) => ({
    ...r,
    permission_ids: rolePerms.filter((rp) => rp.role_id === r.id).map((rp) => rp.permission_id),
  }));
  await insertChunks(models.Role, roles);
  console.log(`  roles: ${roles.length}`);

  for (const [table, modelName] of TABLES) {
    const rows = read(table);
    if (rows.length) await insertChunks(models[modelName], rows);
    console.log(`  ${table}: ${rows.length}`);
  }

  // dispatches / deliveries with their line items embedded
  const dispatchItems = read('dispatch_items');
  const dispatches = read('dispatches').map((d) => ({
    ...d,
    items: dispatchItems.filter((i) => i.dispatch_id === d.id).map((i) => ({ order_item_id: i.order_item_id, quantity: i.quantity })),
  }));
  if (dispatches.length) await insertChunks(models.Dispatch, dispatches);
  console.log(`  dispatches: ${dispatches.length}`);

  const deliveryItems = read('delivery_items');
  const deliveries = read('deliveries').map((d) => ({
    ...d,
    items: deliveryItems.filter((i) => i.delivery_id === d.id).map((i) => ({ order_item_id: i.order_item_id, quantity: i.quantity })),
  }));
  if (deliveries.length) await insertChunks(models.Delivery, deliveries);
  console.log(`  deliveries: ${deliveries.length}`);

  const settings = read('settings');
  for (const s of settings) {
    await models.Setting.updateOne({ key: s.key }, { $set: { value: String(s.value), updated_at: s.updated_at || null } }, { upsert: true });
  }
  console.log(`  settings: ${settings.length}`);

  await models.syncAllCounters();
  // keep SQLite's AUTOINCREMENT positions so ids of deleted rows are never reused
  if (tableNames.has('sqlite_sequence')) {
    for (const row of sqlite.all('SELECT name, seq FROM sqlite_sequence').map(clean)) {
      await models.Counter.updateOne({ _id: row.name, seq: { $lt: row.seq } }, { $set: { seq: row.seq } });
    }
  }
  sqlite.close();
  await ensurePermissions();
  await disconnectDB();
  console.log('Import finished. Start the API with: npm run dev');
  process.exit(0);
})().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
