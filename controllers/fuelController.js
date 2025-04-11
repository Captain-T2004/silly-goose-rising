const { ShipModel, RouteHistoryModel, FuelUsageModel } = require('../models');

const getFuelEstimate = async (req, res) => {
  try {
    const ships = await ShipModel.findAll();

    if (req.query.shipId) {
      const shipId = req.query.shipId;
      const fuelData = await FuelUsageModel.findByShipId(shipId);
      const routes = await RouteHistoryModel.findByShipId(shipId);
      const avgFuelConsumption = fuelData.length > 0
        ? fuelData.reduce((sum, record) => sum + record.fuelConsumed, 0) / fuelData.length
        : 0;

      return res.json({
        shipId,
        avgFuelConsumption,
        fuelEstimate: avgFuelConsumption * 1.1, // Adding 10% margin
        historicalRoutes: routes.length,
        historicalFuelData: fuelData.length
      });
    }
    res.json({ ships: ships.map(s => ({ shipId: s.shipId, capacity: s.capacity })) });
  } catch (error) {
    console.error('Error in fuel estimate:', error);
    res.status(500).json({ error: 'Failed to retrieve fuel estimates' });
  }
};

module.exports = {
  getFuelEstimate
};