// Disk storage for uploaded images / proofs.
// DB stores only a relative path like "/uploads/products/<uuid>.png".
// The API response layer (middleware/uploadUrls.js) turns it into a full URL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../../uploads');

const URL_PREFIX = '/uploads/';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

const DATA_URL_RE = /^data:([a-z0-9.+\/-]+);base64,/i;

const isDataUrl = (v) => typeof v === 'string' && DATA_URL_RE.test(v);

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Public base URL of this API ( set PUBLIC_BASE_URL in .env behind a proxy / CDN )
function publicBase(req) {
  const env = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  if (!req) return '';
  return `${req.protocol}://${req.get('host')}`;
}

function parseDataUrl(value, maxBytes = MAX_BYTES) {
  const m = DATA_URL_RE.exec(value);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) throw httpError(400, 'Unsupported file type. Use PNG, JPG, WEBP, GIF or PDF.');
  const buffer = Buffer.from(value.slice(m[0].length), 'base64');
  if (!buffer.length) throw httpError(400, 'Uploaded file is empty');
  if (buffer.length > maxBytes) throw httpError(400, `File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`);
  return { mime, ext, buffer };
}

// Writes a base64 data URL to disk, returns "/uploads/<folder>/<uuid>.<ext>"
async function saveDataUrl(dataUrl, folder, { maxBytes = MAX_BYTES } = {}) {
  const parsed = parseDataUrl(dataUrl, maxBytes);
  if (!parsed) throw httpError(400, 'Invalid file data');
  const safeFolder = String(folder || 'misc').replace(/[^a-z0-9_-]/gi, '') || 'misc';
  const dir = path.join(UPLOAD_DIR, safeFolder);
  await fs.promises.mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${parsed.ext}`;
  await fs.promises.writeFile(path.join(dir, name), parsed.buffer);
  return `${URL_PREFIX}${safeFolder}/${name}`;
}

// Best-effort delete. Only touches files inside UPLOAD_DIR.
async function deleteUploaded(relPath) {
  if (typeof relPath !== 'string' || !relPath.startsWith(URL_PREFIX)) return;
  const abs = path.resolve(UPLOAD_DIR, relPath.slice(URL_PREFIX.length));
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) return;
  try {
    await fs.promises.unlink(abs);
  } catch (_e) {
    /* already gone */
  }
}

/**
 * Normalises an image/proof field coming from the client:
 *  - data:...;base64,...      -> saved on disk, returns "/uploads/..." path
 *  - our own full upload URL  -> converted back to the relative "/uploads/..." path
 *  - external http(s) / empty -> returned unchanged
 */
async function resolveFileInput(value, folder, req) {
  if (typeof value !== 'string' || !value) return value;
  const v = value.trim();
  if (isDataUrl(v)) return saveDataUrl(v, folder);
  const base = publicBase(req);
  if (base && v.startsWith(base + URL_PREFIX)) return v.slice(base.length);
  return v;
}

module.exports = {
  UPLOAD_DIR, URL_PREFIX, MAX_BYTES, MIME_EXT,
  isDataUrl, parseDataUrl, saveDataUrl, deleteUploaded, resolveFileInput, publicBase,
};
