const express = require('express');
const router = express.Router();

const { getFuelEstimate } = require('../controllers/fuelController');
const { getMaintenanceSchedule } = require('../controllers/maintenanceController');
const { getAnalytics } = require('../controllers/analyticsController');
const {
  createRoutePlan,
  getShipRoutes,
  getRouteById,
  updateRouteStatus,
  generateAlternativeRoutes,
  updateRouteWeather,
  completeRoute,
  getOptimalSpeed,
  scheduleMaintenance
} = require('../controllers/routePlanController');
const {
  register,
  login,
  getCurrentUser,
  refreshAccessToken,
  logout,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');

const { protect, authorize } = require('../middleware/auth');

// Auth routes
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', protect, getCurrentUser);
router.post('/auth/refresh-token', refreshAccessToken);
router.post('/auth/logout', logout);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password', resetPassword);

// Fuel and maintenance routes
router.get('/fuel-estimate', protect, getFuelEstimate);
router.get('/maintenance-schedule', protect, getMaintenanceSchedule);
router.post('/maintenance/schedule', protect, scheduleMaintenance);
router.get('/analytics', protect, getAnalytics);

// Route planning routes
router.post('/route-plan', protect, createRoutePlan);
router.get('/ships/:shipId/routes', protect, getShipRoutes);
router.get('/routes/:routeId', protect, getRouteById);
router.patch('/routes/:routeId/status', protect, updateRouteStatus);
router.post('/route-alternatives', protect, generateAlternativeRoutes);
router.get('/routes/:routeId/update-weather', protect, updateRouteWeather);
router.post('/routes/:routeId/complete', protect, completeRoute);
router.get('/routes/:routeId/optimal-speed', protect, getOptimalSpeed);

module.exports = router;