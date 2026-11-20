const bcrypt = require('bcryptjs');
const { User, Role } = require('../models');
const { generateToken, getRolePermissionCodes } = require('../middleware/auth');
const { logActivity } = require('../utils/audit');
const { escapeRegex } = require('../utils/helpers');

// Quick-login cards shown on the Login page
exports.demoUsers = (_req, res) => {
  const users = [
    { role: 'Super Admin', email: 'superadmin@lubricantdemo.com', name: 'Siddharth Oberoi', badge: 'Full Access', color: 'indigo' },
    { role: 'Admin', email: 'admin@lubricantdemo.com', name: 'Rajesh Mehra', badge: 'Operations Manager', color: 'blue' },
    { role: 'Accounts', email: 'accounts@lubricantdemo.com', name: 'Kavita Sundaram', badge: 'Finance & Payments', color: 'emerald' },
    { role: 'Sales Person', email: 'akash@lubricantdemo.com', name: 'Akash Singh (Sales)', badge: 'West Region Lead', color: 'amber' },
    { role: 'Sales Person', email: 'rahul@lubricantdemo.com', name: 'Rahul Sharma (Sales)', badge: 'Gujarat Region Lead', color: 'amber' },
    { role: 'Production Team', email: 'production@lubricantdemo.com', name: 'Vikram Patel', badge: 'Plant Formulation Lead', color: 'purple' },
  ];
  res.json({ users, defaultPassword: 'See card hint' });
};

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await User.row({
    email: new RegExp(`^${escapeRegex(String(email).trim())}$`, 'i'),
    status: 'active',
  });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or inactive user account' });
  }

  const isMatch = await bcrypt.compare(String(password), user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const role = await Role.row({ id: user.role_id });
  if (!role) {
    return res.status(401).json({ error: 'Invalid email or inactive user account' });
  }

  const token = generateToken(user.id);
  const permissions = await getRolePermissionCodes(user.role_id);

  await logActivity(user.id, 'LOGIN', 'auth', user.id, `${user.name} logged into the system`);

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role_id: user.role_id,
      role_name: role.name,
      role_slug: role.slug,
      mobile: user.mobile,
      employee_id: user.employee_id,
      avatar_url: user.avatar_url,
      permissions,
    },
  });
};

exports.me = (req, res) => {
  res.json({ user: req.user });
};

exports.logout = (_req, res) => {
  // JWT is stateless - the client simply drops the token
  res.json({ success: true });
};
