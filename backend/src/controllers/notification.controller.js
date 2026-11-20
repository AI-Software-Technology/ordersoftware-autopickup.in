const { Notification, ActivityLog, User, Role } = require('../models');
const { toId, uniq } = require('../utils/helpers');

// Notifications addressed to the user, to the user's role, or broadcast to everyone
const audience = (user) => ({
  $or: [{ user_id: user.id }, { role_slug: user.role_slug }, { user_id: null, role_slug: null }],
});

exports.list = async (req, res) => {
  const filter = audience(req.user);
  const [notifications, unreadCount] = await Promise.all([
    Notification.rows(filter, { sort: { id: -1 }, limit: 20 }),
    Notification.countDocuments({ $and: [filter, { is_read: 0 }] }),
  ]);
  res.json({ notifications, unreadCount });
};

exports.markRead = async (req, res) => {
  await Notification.updateOne({ id: toId(req.params.id) }, { $set: { is_read: 1 } });
  res.json({ success: true });
};

exports.markAllRead = async (req, res) => {
  const user = req.user;
  await Notification.updateMany({ $or: [{ user_id: user.id }, { role_slug: user.role_slug }] }, { $set: { is_read: 1 } });
  res.json({ success: true });
};


 // GET /api/activity-logs?page=1&limit=10
 // Audit trail with pagination

exports.activityLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const requestedLimit = parseInt(req.query.limit, 10) || 10;
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const skip = (page - 1) * limit;

    // Fetch paginated activity logs
    const rows = await ActivityLog.rows(
      {},
      {
        sort: { id: -1 },
        skip,
        limit,
      }
    );

    const users = await User.byIds(
      uniq(rows.map((a) => a.user_id)),
      'id name email role_id'
    );

    const roles = await Role.byIds(
      uniq([...users.values()].map((u) => u.role_id)),
      'id name'
    );

    const logs = rows.map((a) => {
      const u = users.get(a.user_id);

      return {
        ...a,
        user_name: u?.name ?? null,
        user_email: u?.email ?? null,
        role_name: u
          ? roles.get(u.role_id)?.name ?? null
          : null,
      };
    });

    // Total count for pagination metadata
    const total = await ActivityLog.count({});

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};