const bcrypt = require('bcryptjs');
const { User, Role } = require('../models');
const { logActivity } = require('../utils/audit');
const { toId, escapeRegex, uniq } = require('../utils/helpers');

const emailRx = (email) => new RegExp(`^${escapeRegex(String(email).trim())}$`, 'i');

exports.list = async (_req, res) => {
  const rows = await User.rows({}, { select: 'id name email mobile employee_id avatar_url status created_at role_id', sort: { id: 1 } });
  const roles = await Role.byIds(uniq(rows.map((u) => u.role_id)), 'id name slug');
  const users = rows
    .filter((u) => roles.has(u.role_id))
    .map((u) => ({ ...u, role_name: roles.get(u.role_id).name, role_slug: roles.get(u.role_id).slug }));
  res.json({ users });
};

exports.create = async (req, res) => {
  const { name, email, password, role_id, mobile, employee_id } = req.body;
  if (!name || !email || !password || !role_id) {
    return res.status(400).json({ error: 'Name, email, password, and role are required' });
  }
  if (await User.exists({ email: emailRx(email) })) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }
  if (employee_id && (await User.exists({ employee_id }))) {
    return res.status(400).json({ error: 'A user with this Employee ID already exists' });
  }
  if (!(await Role.exists({ id: toId(role_id) }))) {
    return res.status(400).json({ error: 'Selected role does not exist' });
  }

  const user = await User.insert({
    name,
    email: String(email).trim(),
    password_hash: await bcrypt.hash(String(password), 10),
    role_id: toId(role_id),
    mobile: mobile || null,
    employee_id: employee_id || null,
    status: 'active',
  });

  await logActivity(req.user.id, 'USER_CREATED', 'user', email, `Created user account for ${name} (${email})`);
  res.json({ id: user.id, message: 'User created successfully' });
};

exports.update = async (req, res) => {
  const id = toId(req.params.id);
  const { name, email, password, role_id, mobile, employee_id, status } = req.body;

  if (email && (await User.exists({ email: emailRx(email), id: { $ne: id } }))) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }
  if (employee_id && (await User.exists({ employee_id, id: { $ne: id } }))) {
    return res.status(400).json({ error: 'A user with this Employee ID already exists' });
  }

  const set = { name, email, role_id: toId(role_id), mobile, employee_id, status: status || 'active' };
  // Password is only changed when a new one ( min 6 chars ) is supplied
  if (password && String(password).trim().length >= 6) {
    set.password_hash = await bcrypt.hash(String(password), 10);
  }
  Object.keys(set).forEach((k) => set[k] === undefined && delete set[k]);
  if (set.role_id === null) delete set.role_id;

  await User.updateOne({ id }, { $set: set });
  await logActivity(req.user.id, 'USER_UPDATED', 'user', req.params.id, `Updated user credentials for ID ${req.params.id}`);
  res.json({ message: 'User updated successfully' });
};
