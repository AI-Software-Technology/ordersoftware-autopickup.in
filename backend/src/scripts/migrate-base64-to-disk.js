// One-time migration: base64 images stored in MongoDB  ->  files on disk.
//
//   npm run migrate:images -- --dry     preview only (nothing written)
//   npm run migrate:images              convert + update DB
//
// Safe to re-run: only rows whose field still starts with "data:" are touched.
// Each file is written first, then the DB row is updated (file removed again if the DB update fails).
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const { Product, Company, Payment, User, Delivery } = require('../models');
const { saveDataUrl, deleteUploaded, UPLOAD_DIR } = require('../utils/uploads');

const DRY = process.argv.includes('--dry');
const MAX_BYTES = 50 * 1024 * 1024; // legacy rows may be larger than the new 5 MB upload limit

// [Model, field holding the base64, upload sub-folder]
const TARGETS = [
  [Product, 'image_url', 'products'],
  [Company, 'logo_url', 'companies'],
  [Payment, 'proof_url', 'payments'],
  [User, 'avatar_url', 'avatars'],
  [Delivery, 'pod_url', 'deliveries'],
];

const fmt = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

async function migrateTarget(Model, field, folder) {
  const label = `${Model.modelName}.${field}`;
  const filter = { [field]: { $regex: '^data:' } };
  const stats = { found: 0, converted: 0, failed: 0, bytes: 0 };

  const cursor = Model.find(filter, `_id id ${field}`).lean().cursor();
  for await (const doc of cursor) {
    stats.found++;
    const value = doc[field];
    stats.bytes += value.length;
    const rowName = `${label} id=${doc.id}`;

    if (DRY) {
      console.log(`  [dry] ${rowName}  ${fmt(value.length)}  ${value.slice(0, 30)}...`);
      continue;
    }

    let relPath;
    try {
      relPath = await saveDataUrl(value, folder, { maxBytes: MAX_BYTES });
      await Model.updateOne({ _id: doc._id }, { $set: { [field]: relPath } });
      stats.converted++;
      console.log(`  ok  ${rowName} -> ${relPath}`);
    } catch (err) {
      stats.failed++;
      if (relPath) await deleteUploaded(relPath);
      console.error(`  FAIL ${rowName}: ${err.message}`);
    }
  }

  console.log(
    `${label}: found ${stats.found}, converted ${stats.converted}, failed ${stats.failed}, base64 size ${fmt(stats.bytes)}`
  );
  return stats;
}

(async () => {
  console.log(DRY ? 'DRY RUN - nothing will be written' : 'Migrating base64 images to disk');
  console.log(`Upload dir: ${UPLOAD_DIR}\n`);
  await connectDB();

  const total = { found: 0, converted: 0, failed: 0, bytes: 0 };
  for (const [Model, field, folder] of TARGETS) {
    const s = await migrateTarget(Model, field, folder);
    for (const k of Object.keys(total)) total[k] += s[k];
  }

  console.log(
    `\nDONE. found ${total.found}, converted ${total.converted}, failed ${total.failed}, base64 freed ~${fmt(total.bytes)}`
  );
  if (!DRY && total.converted) {
    console.log('Tip: Mongo does not shrink files on disk by itself. Optional: db.runCommand({ compact: "<collection>" })');
  }
  await disconnectDB();
  process.exit(total.failed ? 1 : 0);
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
