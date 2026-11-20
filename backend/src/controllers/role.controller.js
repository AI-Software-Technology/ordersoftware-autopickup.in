// Dynamic Roles & Permissions matrix
const { Role, Permission, User } = require('../models');
const { logActivity } = require('../utils/audit');
const { escapeRegex } = require('../utils/helpers');

const canManageRoles = (user) =>
  user.role_slug === 'super_admin' || user.role_slug === 'admin' ||
  user.permissions?.includes('roles:manage') || user.permissions?.includes('roles.manage');

const sortPerms = (list) => [...list].sort((a, b) => (a.module === b.module ? a.id - b.id : a.module < b.module ? -1 : 1));
const publicPerm = (p) => ({ id: p.id, code: p.code, module: p.module, action: p.action, description: p.description });
const nameRx = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');

function attachPermissions(role, allPerms) {
  const granted = new Set(role.permission_ids || []);
  const perms = sortPerms(allPerms.filter((p) => granted.has(p.id))).map(publicPerm);
  return { ...role, permissions: perms, permission_ids: perms.map((p) => p.id) };
}

const parseRoleId = (req) => {
  const id = Number(req.params.id);
  return !id || isNaN(id) ? null : id;
};

exports.list = async (req, res) => {
  const user = req.user;
  const canView = canManageRoles(user) || user.permissions?.includes('roles:view') || user.permissions?.includes('roles.view');
  if (!canView) return res.status(403).json({ error: 'Forbidden: Missing permission to view roles' });

  const [roles, permissions] = await Promise.all([Role.rows({}, { sort: { id: 1 } }), Permission.rows({})]);
  res.json({
    roles: roles.map((r) => attachPermissions(r, permissions)),
    allPermissions: sortPerms(permissions),
  });
};

exports.getPermissions = async (req, res) => {
  const roleId = parseRoleId(req);
  if (!roleId) return res.status(400).json({ error: 'Valid numeric role ID required' });

  const role = await Role.row({ id: roleId });
  if (!role) return res.status(404).json({ error: 'Role not found' });

  const full = attachPermissions(role, await Permission.rows({}));
  res.json({
    role: { id: role.id, name: role.name, slug: role.slug, description: role.description, is_system: role.is_system },
    permissions: full.permissions,
    permission_ids: full.permission_ids,
  });
};

// PUT|POST /api/roles/:id/permissions  ( replaces the whole permission set )
exports.savePermissions = async (req, res) => {
  const user = req.user;
  if (!canManageRoles(user)) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to manage roles' });
  }

  const roleId = parseRoleId(req);
  if (!roleId) return res.status(400).json({ error: 'Valid numeric role ID required' });

  const role = await Role.row({ id: roleId });
  if (!role) return res.status(404).json({ error: `Role with ID ${roleId} not found` });

  const rawList = Array.isArray(req.body.permission_ids)
    ? req.body.permission_ids
    : Array.isArray(req.body.permissions) ? req.body.permissions : null;
  if (!rawList) return res.status(400).json({ error: 'permission_ids array required' });

  // Accepts numeric ids, numeric strings or permission codes ( "orders:view" / "orders.view" )
  const allDbPerms = await Permission.rows({});
  const idMap = new Map();
  const codeMap = new Map();
  for (const p of allDbPerms) {
    idMap.set(p.id, p);
    codeMap.set(p.code.toLowerCase(), p);
    codeMap.set(p.code.replace(/:/g, '.').toLowerCase(), p);
    codeMap.set(p.code.replace(/\./g, ':').toLowerCase(), p);
  }

  const validPermIds = new Set();
  const invalidItems = [];
  for (const item of rawList) {
    if (typeof item === 'number' && idMap.has(item)) {
      validPermIds.add(item);
    } else if (typeof item === 'string') {
      const n = parseInt(item.trim(), 10);
      if (!isNaN(n) && idMap.has(n)) validPermIds.add(n);
      else {
        const match = codeMap.get(item.trim().toLowerCase());
        if (match) validPermIds.add(match.id);
        else invalidItems.push(item);
      }
    } else {
      invalidItems.push(item);
    }
  }
  if (invalidItems.length > 0) {
    return res.status(400).json({ error: `Invalid permission identifier(s): ${invalidItems.join(', ')}` });
  }

  const finalPermIds = Array.from(validPermIds);
  await Role.updateOne({ id: roleId }, { $set: { permission_ids: finalPermIds } });

  await logActivity(user.id, 'ROLE_PERMS_UPDATED', 'role', roleId, `Updated permissions matrix for role "${role.name}" (${finalPermIds.length} permissions active)`);

  return res.json({
    success: true,
    message: 'Permissions saved successfully.',
    role_id: roleId,
    role_name: role.name,
    permission_count: finalPermIds.length,
    permission_ids: finalPermIds,
  });
};

exports.create = async (req, res) => {
  const user = req.user;
  if (!canManageRoles(user)) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to create roles.' });
  }

  const { name, description, permission_ids } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Role name is required.' });

  const trimmedName = String(name).trim();
  if (await Role.exists({ name: nameRx(trimmedName) })) {
    return res.status(400).json({ error: `A role with the name "${trimmedName}" already exists.` });
  }

  // Unique slug
  let baseSlug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!baseSlug) baseSlug = 'custom_role';
  let slug = baseSlug;
  let counter = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Role.exists({ slug })) slug = `${baseSlug}_${counter++}`;

  const desc =
    description !== undefined && description !== null && String(description).trim() !== ''
      ? String(description).trim()
      : `Custom role created by ${user.name}`;

  const allPerms = await Permission.rows({});
  const validIds = new Set(allPerms.map((p) => p.id));
  const initialIds = Array.isArray(permission_ids)
    ? [...new Set(permission_ids.filter((pid) => typeof pid === 'number' && validIds.has(pid)))]
    : [];

  const newRole = await Role.insert({ name: trimmedName, slug, description: desc, is_system: 0, permission_ids: initialIds });

  await logActivity(user.id, 'ROLE_CREATED', 'role', newRole.id, `${user.name} created custom role "${trimmedName}" (slug: ${slug})`);

  res.status(201).json({
    success: true,
    message: `Custom role "${trimmedName}" created successfully.`,
    role: attachPermissions(newRole, allPerms),
  });
};

exports.update = async (req, res) => {
  const user = req.user;
  if (!canManageRoles(user)) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to edit roles.' });
  }

  const roleId = parseRoleId(req);
  if (!roleId) return res.status(400).json({ error: 'Valid numeric role ID required.' });

  const role = await Role.row({ id: roleId });
  if (!role) return res.status(404).json({ error: 'Role not found.' });

  const { name, description } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Role name is required.' });

  const trimmedName = String(name).trim();
  if (role.is_system === 1 && trimmedName.toLowerCase() !== role.name.toLowerCase()) {
    return res.status(400).json({ error: 'Cannot rename core system roles.' });
  }
  if (await Role.exists({ name: nameRx(trimmedName), id: { $ne: roleId } })) {
    return res.status(400).json({ error: `A role with the name "${trimmedName}" already exists.` });
  }

  const updatedDesc = description !== undefined && description !== null ? String(description).trim() : role.description;
  await Role.updateOne({ id: roleId }, { $set: { name: trimmedName, description: updatedDesc } });

  await logActivity(user.id, 'ROLE_UPDATED', 'role', roleId, `${user.name} updated role details for "${trimmedName}"`);

  const [updatedRole, allPerms] = await Promise.all([Role.row({ id: roleId }), Permission.rows({})]);
  res.json({ success: true, message: 'Role updated successfully.', role: attachPermissions(updatedRole, allPerms) });
};

exports.remove = async (req, res) => {
  const user = req.user;
  if (!canManageRoles(user)) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to delete roles.' });
  }

  const roleId = parseRoleId(req);
  if (!roleId) return res.status(400).json({ error: 'Valid numeric role ID required.' });

  const role = await Role.row({ id: roleId });
  if (!role) return res.status(404).json({ error: 'Role not found.' });
  if (role.is_system === 1) {
    return res.status(400).json({ error: `Core system role "${role.name}" cannot be deleted.` });
  }

  const assignedUsers = await User.countDocuments({ role_id: roleId });
  if (assignedUsers > 0) {
    return res.status(400).json({
      error: `Cannot delete role "${role.name}": ${assignedUsers} user(s) currently assigned. Please reassign them to another role first.`,
    });
  }

  await Role.deleteOne({ id: roleId });
  await logActivity(user.id, 'ROLE_DELETED', 'role', roleId, `${user.name} deleted custom role "${role.name}" (slug: ${role.slug})`);

  res.json({ success: true, message: `Custom role "${role.name}" deleted successfully.` });
};
