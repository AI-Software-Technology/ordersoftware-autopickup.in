const { ActivityLog, Notification, OrderStatusHistory } = require('../models');

// Audit trail entry (never throws - logging must not break the request)
async function logActivity(userId, action, entityType, entityId, description) {
  try {
    await ActivityLog.insert({
      user_id: userId ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId === null || entityId === undefined ? null : String(entityId),
      description,
    });
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

// In-app notification for a single user and/or every user of a role
async function sendNotification(userId, roleSlug, title, message, type = 'info', orderId = null) {
  try {
    await Notification.insert({
      user_id: userId ?? null,
      role_slug: roleSlug ?? null,
      title,
      message,
      type,
      order_id: orderId,
    });
  } catch (err) {
    console.error('Failed to send notification:', err.message);
  }
}

// Order timeline entry
function addHistory(orderId, stageName, previousStatus, newStatus, notes, userId) {
  return OrderStatusHistory.insert({
    order_id: orderId,
    stage_name: stageName,
    previous_status: previousStatus ?? null,
    new_status: newStatus,
    notes: notes ?? null,
    created_by_id: userId,
  });
}

module.exports = { logActivity, sendNotification, addHistory };
