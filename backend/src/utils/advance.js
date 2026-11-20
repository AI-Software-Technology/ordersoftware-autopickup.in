// Advance = cash already received on an OPEN order for units that are not yet delivered
// ( e.g. order 4800, paid 4800, delivered 2100  ->  2700 advance held on that order ).
const { OrderItem } = require('../models');
const { round2 } = require('./helpers');

const CLOSED = ['DELIVERED', 'COMPLETED', 'CANCELLED'];

// Returns Map( order_id -> advance held ) for the given orders
async function heldAdvanceByOrder(orders) {
  const open = orders.filter((o) => !CLOSED.includes(o.order_status) && (o.amount_received || 0) > 0);
  const out = new Map();
  if (!open.length) return out;
  const items = await OrderItem.rows({ order_id: { $in: open.map((o) => o.id) } }, { select: 'order_id delivered_quantity rate' });
  const delivered = new Map();
  for (const i of items) delivered.set(i.order_id, (delivered.get(i.order_id) || 0) + (i.delivered_quantity || 0) * (i.rate || 0));
  for (const o of open) {
    const held = round2(Math.max(0, Math.min(o.amount_received || 0, o.grand_total || 0) - (delivered.get(o.id) || 0)));
    if (held > 0.01) out.set(o.id, held);
  }
  return out;
}

module.exports = { heldAdvanceByOrder };
