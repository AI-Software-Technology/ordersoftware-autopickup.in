// Usage:  npm run seed          -> seeds only when the database is empty
//         npm run seed:reset    -> wipes ALL data and reloads the demo dataset
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const { seedDatabase } = require('../seed/seed');

(async () => {
  const force = process.argv.includes('--force');
  await connectDB();
  await seedDatabase(force);
  await disconnectDB();
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
