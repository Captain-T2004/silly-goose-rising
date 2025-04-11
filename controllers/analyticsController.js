const { ShipModel, RouteHistoryModel, FuelUsageModel, MaintenanceLogModel } = require('../models');

const getAnalytics = async (req, res) => {
  try {
    const ships = await ShipModel.findAll();

    const analyticsData = await Promise.all(ships.map(async (ship) => {
      const routes = await RouteHistoryModel.findByShipId(ship.shipId);
      const fuelData = await FuelUsageModel.findByShipId(ship.shipId);
      const maintenanceLogs = await MaintenanceLogModel.findByShipId(ship.shipId);

      const totalDistance = routes.reduce((sum, route) => sum + route.distance, 0);
      const totalFuel = fuelData.reduce((sum, record) => sum + record.fuelConsumed, 0);
      const fuelEfficiency = totalDistance > 0 ? totalDistance / totalFuel : 0;
      const maintenanceCosts = maintenanceLogs
        .filter(log => log.maintenanceCost)
        .reduce((sum, log) => sum + log.maintenanceCost, 0);

      return {
        shipId: ship.shipId,
        totalDistance,
        totalFuel,
        fuelEfficiency,
        maintenanceCosts,
        routeCount: routes.length,
        engineHours: ship.engineHours
      };
    }));

    res.json({
      fleetSize: ships.length,
      analytics: analyticsData,
      fleetEfficiency: analyticsData.reduce((sum, data) => sum + data.fuelEfficiency, 0) / analyticsData.length
    });
  } catch (error) {
    console.error('Error in analytics:', error);
    res.status(500).json({ error: 'Failed to retrieve analytics data' });
  }
};

module.exports = {
  getAnalytics
};