// Full RBAC permission matrix + default role grants.
// ensurePermissions() is idempotent and runs on every server start.
const { Role, Permission, Setting, User } = require('../models');

const FULL_PERMISSIONS = [
  { module: 'Dashboard', action: 'View Dashboard', code: 'dashboard:view', description: 'Access operational dashboard and metrics' },
  { module: 'Orders', action: 'View All Orders', code: 'orders:view_all', description: 'View orders across entire enterprise' },
  { module: 'Orders', action: 'View Own Orders', code: 'orders:view_own', description: 'View only orders assigned to self' },
  { module: 'Orders', action: 'Create Order', code: 'orders:create', description: 'Create and submit new customer orders' },
  { module: 'Orders', action: 'Edit Order', code: 'orders:edit', description: 'Edit pending/draft commercial orders' },
  { module: 'Orders', action: 'Approve Order', code: 'orders:approve', description: 'Approve orders for packing and fulfillment' },
  { module: 'Orders', action: 'Cancel Order', code: 'orders:cancel', description: 'Cancel orders with reason' },
  { module: 'Orders', action: 'Complete Order', code: 'orders:complete', description: 'Final order closure upon full delivery and payment' },
  { module: 'Orders', action: 'Delete Order', code: 'orders:delete', description: 'Remove / archive cancelled orders' },
  { module: 'Vendors', action: 'View All Vendors', code: 'vendors:view_all', description: 'Access master vendor portfolio' },
  { module: 'Vendors', action: 'View Own Vendors', code: 'vendors:view_own', description: 'Access only assigned vendor accounts' },
  { module: 'Vendors', action: 'Create Vendor', code: 'vendors:create', description: 'Register new client accounts' },
  { module: 'Vendors', action: 'Edit Vendor', code: 'vendors:edit', description: 'Modify vendor profile details' },
  { module: 'Vendors', action: 'Delete Vendor', code: 'vendors:delete', description: 'Deactivate / remove vendor record' },
  { module: 'Products', action: 'View Products', code: 'products:view', description: 'Browse lubricant product catalog' },
  { module: 'Products', action: 'Manage Products', code: 'products:manage', description: 'Create, update, and manage lubricant SKUs' },
  { module: 'Packing', action: 'View Packing', code: 'packing:view', description: 'View orders queued for packing' },
  { module: 'Packing', action: 'Manage Packing', code: 'packing:manage', description: 'Check stock availability and pack items' },
  { module: 'Packing', action: 'Deliver Order', code: 'packing:deliver', description: 'Mark packed orders directly as Delivered' },
  { module: 'Orders', action: 'Deliver Order', code: 'orders:deliver', description: 'Mark packed order as Delivered directly' },
  { module: 'Dispatch', action: 'View Dispatch', code: 'dispatch:view', description: 'View ready consignments and fleet schedules' },
  { module: 'Dispatch', action: 'Create Dispatch', code: 'dispatch:create', description: 'Generate dispatch note and assign vehicle / LR' },
  { module: 'Dispatch', action: 'Update Dispatch', code: 'dispatch:update', description: 'Update LR, tracking numbers and fleet information' },
  { module: 'Delivery', action: 'View Delivery', code: 'delivery:view', description: 'View proof of delivery records' },
  { module: 'Delivery', action: 'Update Delivery', code: 'delivery:update', description: 'Record receiver acknowledgement and closure' },
  { module: 'Bills', action: 'View All Bills', code: 'bills:view_all', description: 'Access enterprise-wide customer bills and invoice records' },
  { module: 'Bills', action: 'View Own Bills', code: 'bills:view_own', description: 'Access only own customer bills and invoices' },
  { module: 'Payments', action: 'View All Payments', code: 'payments:view_all', description: 'Access enterprise-wide customer payment ledger' },
  { module: 'Payments', action: 'View Own Payments', code: 'payments:view_own', description: 'Access only own customer payment records' },
  { module: 'Payments', action: 'View Payments', code: 'payments:view', description: 'Access customer payment ledger' },
  { module: 'Payments', action: 'Add Payment', code: 'payments:add', description: 'Submit / record new payment transaction' },
  { module: 'Payments', action: 'Submit Payment', code: 'payments:submit', description: 'Submit customer payment entry for accounts verification' },
  { module: 'Payments', action: 'Edit Payment', code: 'payments:edit', description: 'Edit existing payment details or audit corrections' },
  { module: 'Payments', action: 'Verify Payment', code: 'payments:verify', description: 'Approve or reject customer payment entries' },
  { module: 'Reports', action: 'View Reports', code: 'reports:view', description: 'Access business, sales, and financial reports' },
  { module: 'Companies', action: 'Manage Companies', code: 'companies:manage', description: 'Manage billing entities and bank accounts' },
  { module: 'Users', action: 'View Users', code: 'users:view', description: 'View user directory' },
  { module: 'Users', action: 'Manage Users', code: 'users:manage', description: 'Create, edit and manage user credentials & roles' },
  { module: 'Roles', action: 'View Roles', code: 'roles:view', description: 'View corporate roles and permission configurations' },
  { module: 'Roles', action: 'Manage Roles', code: 'roles:manage', description: 'Create and edit roles, configure dynamic permissions matrix' },
  { module: 'Activity', action: 'View Audit Logs', code: 'activity:view', description: 'Audit trail of system transactions' },
];

// Always granted ( re-applied on every start )
const ALWAYS_GRANTED = {
  sales_person: ['bills:view_own', 'payments:view_own', 'payments:submit', 'payments:add', 'payments:edit', 'payments:view'],
  accounts: ['bills:view_all', 'bills:view_own', 'payments:view_all', 'payments:verify', 'payments:edit', 'payments:add', 'payments:view'],
  admin: ['bills:view_all', 'bills:view_own', 'payments:view_all', 'payments:verify', 'payments:edit', 'payments:add', 'payments:view', 'packing:deliver', 'orders:deliver'],
  packing_team: ['packing:view', 'packing:manage', 'packing:deliver', 'orders:deliver', 'orders:view_all', 'products:view'],
};

// Granted once ( first initialisation ) - can be changed later from the Roles matrix
const BASELINE = {
  admin: [
    'dashboard:view', 'orders:view_all', 'orders:create', 'orders:edit', 'orders:approve', 'orders:cancel', 'orders:complete', 'orders:delete',
    'vendors:view_all', 'vendors:create', 'vendors:edit', 'vendors:delete',
    'products:view', 'products:manage', 'packing:view', 'packing:manage',
    'dispatch:view', 'dispatch:create', 'dispatch:update', 'delivery:view', 'delivery:update',
    'payments:view', 'payments:add', 'reports:view', 'companies:manage',
    'users:view', 'users:manage', 'roles:view', 'roles:manage', 'activity:view',
  ],
  accounts: ['dashboard:view', 'orders:view_all', 'payments:view', 'payments:add', 'payments:verify', 'reports:view', 'vendors:view_all'],
  sales_person: [
    'dashboard:view', 'orders:view_own', 'orders:create', 'orders:edit', 'vendors:view_own', 'vendors:create', 'vendors:edit',
    'products:view', 'packing:view', 'dispatch:view', 'payments:view', 'payments:add',
  ],
  packing_team: ['dashboard:view', 'packing:view', 'packing:manage', 'orders:view_all', 'products:view'],
};

async function ensurePermissions() {
  // 1. Make sure every permission of the matrix exists
  const existing = new Set((await Permission.rows({}, { select: 'code' })).map((p) => p.code));
  for (const p of FULL_PERMISSIONS) {
    if (!existing.has(p.code)) await Permission.insert(p);
  }

  // 2. Production Team was renamed to Packing Team
  await Role.updateOne(
    { slug: 'production_team' },
    { $set: { name: 'Packing Team', slug: 'packing_team', description: 'Packing floor, stock readiness, box packaging and dispatch bay handover' } }
  );

  // 2b. "Dispatch Team" role was removed. Move its users to Packing Team, then delete the role.
  const dispatchRole = await Role.row({ slug: 'dispatch_team' });
  if (dispatchRole) {
    const packingRole = await Role.row({ slug: 'packing_team' });
    if (packingRole) {
      await User.updateMany({ role_id: dispatchRole.id }, { $set: { role_id: packingRole.id } });
      await Role.deleteOne({ id: dispatchRole.id });
    }
  }

  const permMap = {};
  for (const p of await Permission.rows({}, { select: 'id code' })) permMap[p.code] = p.id;

  const grant = async (slug, codes) => {
    const ids = codes.map((c) => permMap[c]).filter(Boolean);
    if (ids.length) await Role.updateOne({ slug }, { $addToSet: { permission_ids: { $each: ids } } });
  };

  // 3. Super Admin always has everything
  await grant('super_admin', Object.keys(permMap));

  // 4. Mandatory grants
  for (const [slug, codes] of Object.entries(ALWAYS_GRANTED)) await grant(slug, codes);

  // 5. One-time baseline
  if (!(await Setting.getValue('rbac_baseline_initialized'))) {
    for (const [slug, codes] of Object.entries(BASELINE)) await grant(slug, codes);
    await Setting.setValue('rbac_baseline_initialized', '1');
  }
}

module.exports = { ensurePermissions, FULL_PERMISSIONS };
