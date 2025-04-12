const express = require('express');
const router = express.Router();

const { getFuelEstimate } = require('../controllers/fuelController');
const { getMaintenanceSchedule } = require('../controllers/maintenanceController');
const { getAnalytics } = require('../controllers/analyticsController');
const { createRoutePlan } = require('../controllers/routePlanController');
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

router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', protect, getCurrentUser);
router.post('/auth/refresh-token', refreshAccessToken);
router.post('/auth/logout', logout);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password', resetPassword);

router.get('/fuel-estimate', protect, getFuelEstimate);
router.get('/maintenance-schedule', protect, getMaintenanceSchedule);
router.get('/analytics', protect, authorize('admin', 'manager'), getAnalytics);
router.post('/route-plan', protect, createRoutePlan);

module.exports = router;