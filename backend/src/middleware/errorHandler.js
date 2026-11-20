// Wraps async route handlers so rejected promises reach the error middleware
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  // Duplicate key (unique index) -> 400 like the old UNIQUE constraint errors
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'value';
    return res.status(400).json({ error: `Duplicate ${field}: a record with this ${field} already exists` });
  }
  if (err && err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first ? first.message : err.message });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Uploaded data is too large' });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
}

module.exports = { asyncHandler, notFound, errorHandler };
