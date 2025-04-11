const express = require('express');
const router = express.Router();

const { getFuelEstimate } = require('../controllers/fuelController');
const { getMaintenanceSchedule } = require('../controllers/maintenanceController');
const { getAnalytics } = require('../controllers/analyticsController');
const { createRoutePlan } = require('../controllers/routePlanController');

router.get('/fuel-estimate', getFuelEstimate);
router.get('/maintenance-schedule', getMaintenanceSchedule);
router.get('/analytics', getAnalytics);
router.post('/route-plan', createRoutePlan);

module.exports = router;