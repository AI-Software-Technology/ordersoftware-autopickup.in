const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRouter = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const uploadUrls = require('./middleware/uploadUrls');
const { UPLOAD_DIR } = require('./utils/uploads');

const app = express();

// needed so req.protocol is correct behind nginx / Cloudflare (used to build upload URLs)
app.set('trust proxy', true);

const origins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
  })
);

// Uploaded images / payment proofs live on disk and are served from /uploads
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    index: false,
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    },
  })
);

// 25mb: the frontend still posts images as base64 strings; the API writes them to disk
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(uploadUrls);
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/', (_req, res) => res.json({ name: 'Auto pickup Lubricant ERP API', status: 'ok' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api', apiRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
