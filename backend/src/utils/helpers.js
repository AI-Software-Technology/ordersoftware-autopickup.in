// Shared small helpers used by controllers

// Timestamp in the same "YYYY-MM-DD HH:MM:SS" (UTC) format the UI already renders
const nowStr = (d = new Date()) => d.toISOString().replace('T', ' ').slice(0, 19);
const todayStr = () => new Date().toISOString().slice(0, 10);

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => Number(v) || 0;

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Case-insensitive "contains" match (SQL LIKE %term%)
const like = (s) => new RegExp(escapeRegex(s), 'i');

// Numeric id from query/body/params ( null when not a valid integer )
const toId = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

const dateOf = (v) => (v ? String(v).slice(0, 10) : null); // YYYY-MM-DD
const monthOf = (v) => (v ? String(v).slice(0, 7) : null); // YYYY-MM

// Adds an inclusive day range on a "YYYY-MM-DD..." string field to a mongo filter
function addDateRange(filter, field, start, end) {
  if (!start && !end) return filter;
  const cond = {};
  if (start) cond.$gte = String(start);
  if (end) cond.$lte = `${end}\uffff`;
  filter[field] = cond;
  return filter;
}

const inDateRange = (value, start, end) => {
  const d = dateOf(value);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
};

const sumBy = (arr, fn) => arr.reduce((acc, x) => acc + (Number(fn(x)) || 0), 0);
const countBy = (arr, fn) => arr.reduce((acc, x) => acc + (fn(x) ? 1 : 0), 0);
const uniq = (arr) => [...new Set(arr.filter((x) => x !== null && x !== undefined))];
const mapBy = (arr, key = 'id') => new Map(arr.map((x) => [x[key], x]));

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) out[k] = obj[k] === undefined ? null : obj[k];
  return out;
};

const inr = (n) => Number(n).toLocaleString('en-IN');

const isShortRange = (start, end, days) =>
  !!(start && end && new Date(end).getTime() - new Date(start).getTime() <= days * 86400000);

module.exports = {
  nowStr, todayStr, round2, num, like, escapeRegex, toId, dateOf, monthOf,
  addDateRange, inDateRange, sumBy, countBy, uniq, mapBy, groupBy, pick, inr, isShortRange,
};
