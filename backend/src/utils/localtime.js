// Business-day helpers.
//
// Timestamps are stored in UTC ( "2026-10-21 19:30:00" ), but the business works in
// local days ( India = UTC+5:30 ). Without this, an order created at 1 AM on 22 Oct IST
// is stored as 21 Oct UTC, so the dashboard counts it on the wrong day and "Today" shows
// different numbers in different boxes.
//
// Change the offset with env APP_TZ_OFFSET_MIN ( default 330 = IST ).
const OFFSET_MIN = Number(process.env.APP_TZ_OFFSET_MIN ?? 330);
const MIN = 60000;

const fmtUtc = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const parseUtc = (v) => {
  const t = Date.parse(String(v).replace(' ', 'T').slice(0, 19) + 'Z');
  return Number.isNaN(t) ? null : t;
};

// Today's date in business time: YYYY-MM-DD
const todayLocal = () => new Date(Date.now() + OFFSET_MIN * MIN).toISOString().slice(0, 10);

// Business-day of a stored UTC timestamp
const localDateOf = (v) => {
  if (!v) return null;
  const t = parseUtc(v);
  return t === null ? null : new Date(t + OFFSET_MIN * MIN).toISOString().slice(0, 10);
};
const localMonthOf = (v) => {
  const d = localDateOf(v);
  return d ? d.slice(0, 7) : null;
};

const localInRange = (v, start, end) => {
  const d = localDateOf(v);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
};

// Mongo filter on a stored UTC timestamp field for business days start..end ( inclusive )
const addLocalDateRange = (filter, field, start, end) => {
  if (!start && !end) return filter;
  const cond = {};
  if (start) cond.$gte = fmtUtc(Date.parse(`${start}T00:00:00Z`) - OFFSET_MIN * MIN);
  if (end) cond.$lte = fmtUtc(Date.parse(`${end}T23:59:59Z`) - OFFSET_MIN * MIN) + '\uffff';
  filter[field] = cond;
  return filter;
};

module.exports = { todayLocal, localDateOf, localMonthOf, localInRange, addLocalDateRange, OFFSET_MIN };
