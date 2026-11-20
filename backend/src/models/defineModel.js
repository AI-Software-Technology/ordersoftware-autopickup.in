const mongoose = require('mongoose');
const { nowStr } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Counter collection -> gives every document a numeric auto-increment `id`
// (the frontend works with numeric ids, exactly like before).
// ---------------------------------------------------------------------------
const counterSchema = new mongoose.Schema(
  { _id: { type: String }, seq: { type: Number, default: 0 } },
  { collection: 'counters', versionKey: false }
);
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

async function nextId(name) {
  const c = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return c.seq;
}

// Field shorthands
const str = (def = null) => ({ type: String, default: def });
const num = (def = null) => ({ type: Number, default: def });
const reqStr = () => ({ type: String, required: true });
const reqNum = () => ({ type: Number, required: true });
const createdAt = () => ({ type: String, default: () => nowStr() });

const registry = [];

/**
 * Creates a mongoose model with:
 *  - numeric auto-increment `id`
 *  - Model.rows(filter, opts)  -> plain objects without _id
 *  - Model.row(filter)         -> single plain object without _id
 *  - Model.insert(data)        -> creates with next id, returns plain object
 *  - Model.byIds(ids)          -> Map(id -> row)
 */
function defineModel(name, collection, fields, indexes = []) {
  const schema = new mongoose.Schema(
    { id: { type: Number, required: true, unique: true }, ...fields },
    { collection, versionKey: false, id: false, minimize: false }
  );
  for (const idx of indexes) {
    if (Array.isArray(idx)) schema.index(idx[0], idx[1] || {});
    else schema.index(idx);
  }

  schema.statics.nextId = function () {
    return nextId(collection);
  };

  schema.statics.rows = function (filter = {}, opts = {}) {
    const q = this.find(filter, opts.select ? `${opts.select} -_id` : '-_id').lean();
    if (opts.sort) q.sort(opts.sort);
    if (opts.skip) q.skip(opts.skip);
    if (opts.limit) q.limit(opts.limit);
    return q.exec();
  };

    schema.statics.count = function (filter = {}) {
    return this.countDocuments(filter).exec();
  };
  schema.statics.row = function (filter = {}, opts = {}) {
    const q = this.findOne(filter, opts.select ? `${opts.select} -_id` : '-_id').lean();
    if (opts.sort) q.sort(opts.sort);
    return q.exec();
  };

  schema.statics.insert = async function (data) {
    const id = data.id !== undefined && data.id !== null ? data.id : await nextId(collection);
    const doc = await this.create({ ...data, id });
    const obj = doc.toObject();
    delete obj._id;
    return obj;
  };

  schema.statics.byIds = async function (ids, select) {
    const list = [...new Set((ids || []).filter((x) => x !== null && x !== undefined))];
    if (!list.length) return new Map();
    const rows = await this.rows({ id: { $in: list } }, { select });
    return new Map(rows.map((r) => [r.id, r]));
  };

  // Keeps the counter in sync with the highest id (after seed / import)
  schema.statics.syncCounter = async function () {
    const last = await this.findOne({}, 'id -_id').sort({ id: -1 }).lean();
    const max = last ? last.id : 0;
    const cur = await Counter.findOne({ _id: collection }).lean();
    if (!cur || cur.seq < max) {
      await Counter.updateOne({ _id: collection }, { $set: { seq: max } }, { upsert: true });
    }
  };

  const model = mongoose.models[name] || mongoose.model(name, schema);
  registry.push(model);
  return model;
}

async function syncAllCounters() {
  for (const m of registry) await m.syncCounter();
}

module.exports = { defineModel, syncAllCounters, registry, Counter, nextId, str, num, reqStr, reqNum, createdAt };
