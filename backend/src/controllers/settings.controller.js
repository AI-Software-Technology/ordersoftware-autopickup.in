const { Setting } = require('../models');
const { logActivity } = require('../utils/audit');
const { seedDatabase } = require('../seed/seed');

exports.getSettings = async (_req, res) => {
  const rows = await Setting.find({}, '-_id').lean();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
};

// POST /api/settings/reset-demo  -> wipes everything and reloads the demo dataset
exports.resetDemo = async (req, res) => {
  if (String(process.env.ALLOW_DEMO_RESET).toLowerCase() === 'false') {
    return res.status(403).json({ error: 'Demo reset is disabled on this server.' });
  }

  await seedDatabase(true);
  await logActivity(req.user?.id || null, 'SYSTEM_RESET', 'system', 'seed', 'Demo database was reset to factory state');
  res.json({ message: 'Demo database has been restored to factory test state with all 52 orders and test scenarios.' });
};
