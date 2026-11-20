const { User, syncAllCounters } = require('../models');
const { ensurePermissions } = require('./permissions');
const { seedDatabase } = require('./seed');

// Runs once on server start: seed demo data on an empty database,
// keep id counters in sync and make sure the permission matrix is complete.
async function bootstrapDatabase() {
  const userCount = await User.countDocuments({});
  const autoSeed = String(process.env.AUTO_SEED || 'true').toLowerCase() !== 'false';

  if (userCount === 0 && autoSeed) {
    await seedDatabase(false);
  } else {
    await syncAllCounters();
    if (userCount === 0) {
      console.warn('Database has no users and AUTO_SEED=false. Run "npm run seed" to create the demo data.');
    } else {
      await ensurePermissions();
    }
  }
}

module.exports = { bootstrapDatabase };
