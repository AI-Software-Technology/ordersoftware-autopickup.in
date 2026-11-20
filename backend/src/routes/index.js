const express = require('express');
const { authMiddleware: auth, requirePermission: can } = require('../middleware/auth');
const { asyncHandler: h } = require('../middleware/errorHandler');

const authCtrl = require('../controllers/auth.controller');
const dashboard = require('../controllers/dashboard.controller');
const company = require('../controllers/company.controller');
const catalog = require('../controllers/catalog.controller');
const vendor = require('../controllers/vendor.controller');
const order = require('../controllers/order.controller');
const packing = require('../controllers/packing.controller');
const dispatch = require('../controllers/dispatch.controller');
const payment = require('../controllers/payment.controller');
const salesPerson = require('../controllers/salesPerson.controller');
const report = require('../controllers/report.controller');
const user = require('../controllers/user.controller');
const role = require('../controllers/role.controller');
const notification = require('../controllers/notification.controller');
const bill = require('../controllers/bill.controller');
const credit = require('../controllers/credit.controller');
const settings = require('../controllers/settings.controller');

const router = express.Router();

// ----------------------------- AUTH -----------------------------
router.get('/auth/demo-users', authCtrl.demoUsers);
router.post('/auth/login', h(authCtrl.login));
router.get('/auth/me', auth, authCtrl.me);
router.post('/auth/logout', authCtrl.logout);

// ----------------------------- DASHBOARD -----------------------------
router.get('/dashboard/stats', auth, h(dashboard.stats));

// ----------------------------- BILLING COMPANIES -----------------------------
router.get('/companies', auth, h(company.list));
router.post('/companies', auth, can('companies:manage'), h(company.create));
router.put('/companies/:id', auth, can('companies:manage'), h(company.update));
router.delete('/companies/:id', auth, can('companies:manage'), h(company.remove));

// ----------------------------- BRANDS & CATEGORIES -----------------------------
router.get('/brands', auth, h(catalog.brands.list));
router.post('/brands', auth, can('products:manage'), h(catalog.brands.create));
router.put('/brands/:id', auth, can('products:manage'), h(catalog.brands.update));
router.delete('/brands/:id', auth, can('products:manage'), h(catalog.brands.remove));
router.get('/categories', auth, h(catalog.categories.list));
router.post('/categories', auth, can('products:manage'), h(catalog.categories.create));
router.put('/categories/:id', auth, can('products:manage'), h(catalog.categories.update));
router.delete('/categories/:id', auth, can('products:manage'), h(catalog.categories.remove));

// ----------------------------- PRODUCTS -----------------------------
router.get('/products', auth, h(catalog.listProducts));
router.get('/products/vendor-last-rate', auth, h(catalog.vendorLastRate));
router.post('/products', auth, can('products:manage'), h(catalog.createProduct));
router.put('/products/:id', auth, can('products:manage'), h(catalog.updateProduct));
router.delete('/products/:id', auth, can('products:manage'), h(catalog.deleteProduct));

// ----------------------------- PARTIES ( VENDORS ) -----------------------------
router.get('/vendors', auth, h(vendor.list));
router.get('/vendors/:id', auth, h(vendor.getOne));
router.post('/vendors', auth, can('vendors:create'), h(vendor.create));
router.put('/vendors/:id', auth, h(vendor.update));

// ----------------------------- ORDERS -----------------------------
router.get('/orders', auth, h(order.list));
router.get('/orders/delivered', auth, h(order.listDelivered));
router.get('/orders/:id', auth, h(order.getOne));
router.post('/orders', auth, can('orders:create'), h(order.create));
router.put('/orders/:id', auth, h(order.update));
router.post('/orders/:id/accept', auth, can('orders:approve'), h(order.accept));
router.delete('/orders/:id', auth, can('orders:delete'), h(order.remove));
router.post('/orders/:id/cancel', auth, can('orders:cancel'), h(order.cancel));
router.post('/orders/:id/assign-production', auth, can('orders:approve'), h(order.assignProduction));
router.post('/orders/:id/complete', auth, can('orders:complete'), h(order.complete));

// ----------------------------- PACKING -----------------------------
router.get('/packing/orders', auth, h(packing.listOrders));
router.get('/production/orders', auth, h(packing.listOrders));
router.post('/orders/:id/toggle-item-availability', auth, h(packing.toggleItemAvailability));
router.post('/orders/:id/start-packing', auth, h(packing.startPacking));
router.post('/orders/:id/complete-packing', auth, h(packing.completePacking));
router.post('/orders/:id/deliver', auth, h(packing.deliver));
router.post('/orders/:id/close-short', auth, h(packing.closeShort));
router.post('/orders/:id/handover-dispatch', auth, h(packing.handoverDispatch));
router.post('/orders/:id/packing-action', auth, h(packing.packingAction));
router.post('/orders/:id/start-production', auth, h(packing.legacyStartProduction));
router.post('/orders/:id/mark-production-completed', auth, h(packing.legacyMarkProductionCompleted));

// ----------------------------- DISPATCH & DELIVERY -----------------------------
router.get('/dispatch/orders', auth, h(dispatch.listOrders));
router.post('/orders/:id/create-dispatch', auth, can('dispatch:create'), h(dispatch.createDispatch));
router.post('/orders/:id/update-delivery', auth, can('dispatch:update_delivery'), h(dispatch.updateDelivery));

// ----------------------------- PAYMENTS -----------------------------
router.get('/payments/eligible-orders', auth, h(payment.eligibleOrders));
router.get('/payments', auth, h(payment.list));
router.get('/payments/:id', auth, h(payment.getOne));
router.get('/orders/:id/payments', auth, h(payment.listForOrder));
router.post('/orders/:id/add-payment', auth, h(payment.addForOrder));
router.post('/payments', auth, h(payment.create));
router.post('/payments/add', auth, h(payment.create));
router.post('/payments/:id/verify', auth, can('payments:verify'), h(payment.verify));
router.post('/payments/:id/reject', auth, can('payments:verify'), h(payment.reject));
router.put('/payments/:id', auth, h(payment.update));
router.post('/orders/:id/adjust-credit', auth, h(credit.adjustForOrder));
router.get('/vendors/:id/credit', auth, h(credit.vendorCredit));

// ----------------------------- SALES PERSONS -----------------------------
router.get('/sales-persons', auth, h(salesPerson.list));
router.get('/sales-persons/:id', auth, h(salesPerson.getOne));

// ----------------------------- REPORTS -----------------------------
router.get('/reports/:type', auth, can('reports:view'), h(report.getReport));

// ----------------------------- USERS & ROLES -----------------------------
router.get('/users', auth, can('users:manage'), h(user.list));
router.post('/users', auth, can('users:manage'), h(user.create));
router.put('/users/:id', auth, can('users:manage'), h(user.update));

router.get('/roles', auth, h(role.list));
router.post('/roles', auth, h(role.create));
router.get('/roles/:id/permissions', auth, h(role.getPermissions));
router.put('/roles/:id/permissions', auth, h(role.savePermissions));
router.post('/roles/:id/permissions', auth, h(role.savePermissions));
router.put('/roles/:id', auth, h(role.update));
router.delete('/roles/:id', auth, h(role.remove));

// ----------------------------- NOTIFICATIONS & AUDIT LOGS -----------------------------
router.get('/notifications', auth, h(notification.list));
router.post('/notifications/read-all', auth, h(notification.markAllRead));
router.post('/notifications/:id/read', auth, h(notification.markRead));
router.get('/activity-logs', auth, can('activity:view'), h(notification.activityLogs));

// ----------------------------- BILLS -----------------------------
router.get('/bills', auth, h(bill.list));
router.get('/bills/:id', auth, h(bill.getOne));

// ----------------------------- SETTINGS -----------------------------
router.get('/settings', auth, h(settings.getSettings));

module.exports = router;
