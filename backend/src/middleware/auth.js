const jwt = require('jsonwebtoken');
const { User, Role, Permission } = require('../models');

const SECRET = () => process.env.JWT_SECRET || 'Auto pickup-lubricant-erp-jwt-secret-2026';

function generateToken(userId) {
  return jwt.sign({ userId }, SECRET(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET());
    return payload.userId || null;
  } catch {
    return null;
  }
}

// Permission codes granted to a role
async function getRolePermissionCodes(roleId) {
  const role = await Role.row({ id: roleId }, { select: 'permission_ids' });
  if (!role || !role.permission_ids || !role.permission_ids.length) return [];
  const perms = await Permission.rows({ id: { $in: role.permission_ids } }, { select: 'code' });
  return perms.map((p) => p.code);
}

async function getUserWithPermissions(userId) {
  const u = await User.row({ id: userId, status: 'active' });
  if (!u) return null;
  const role = await Role.row({ id: u.role_id });
  if (!role) return null;

  const codes = await getRolePermissionCodes(u.role_id);
  const all = new Set();
  for (const c of codes) {
    all.add(c);
    all.add(c.replace(/:/g, '.'));
    all.add(c.replace(/\./g, ':'));
  }

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role_id: u.role_id,
    role_name: role.name,
    role_slug: role.slug,
    mobile: u.mobile,
    employee_id: u.employee_id,
    avatar_url: u.avatar_url,
    permissions: Array.from(all),
  };
}

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const userId = verifyToken(token);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    const user = await getUserWithPermissions(userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requirePermission(...permissionCodes) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    // Super admin has all permissions
    if (req.user.role_slug === 'super_admin') return next();

    const userPerms = req.user.permissions || [];
    const hasAny = permissionCodes.some((code) => {
      const colonCode = code.replace(/\./g, ':');
      const dotCode = code.replace(/:/g, '.');
      return userPerms.includes(code) || userPerms.includes(colonCode) || userPerms.includes(dotCode);
    });

    if (hasAny) return next();
    return res
      .status(403)
      .json({ error: `Forbidden: Missing required permission (${permissionCodes.join(' or ')})` });
  };
}

module.exports = { generateToken, verifyToken, getUserWithPermissions, getRolePermissionCodes, authMiddleware, requirePermission };
