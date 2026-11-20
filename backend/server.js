require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/db');
const { bootstrapDatabase } = require('./src/seed/bootstrap');

const PORT = parseInt(process.env.PORT, 10) || 5000;

async function start() {
  await connectDB();
  await bootstrapDatabase();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Auto pickup API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
