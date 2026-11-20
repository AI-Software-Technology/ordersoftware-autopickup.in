const mongoose = require('mongoose');
const { nowStr } = require('../utils/helpers');

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    updated_at: { type: String, default: () => nowStr() },
  },
  { collection: 'settings', versionKey: false }
);

schema.statics.getValue = async function (key) {
  const row = await this.findOne({ key }).lean();
  return row ? row.value : null;
};

schema.statics.setValue = function (key, value) {
  return this.updateOne({ key }, { $set: { value: String(value), updated_at: nowStr() } }, { upsert: true });
};

module.exports = mongoose.models.Setting || mongoose.model('Setting', schema);
