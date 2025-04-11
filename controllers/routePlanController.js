const { ShipModel, RouteHistoryModel, FuelUsageModel } = require('../models');

const createRoutePlan = async (req, res) => {
  try {
    const {
      shipId,
      startLocation,
      endLocation,
      plannedStartDate,
      estimatedDistance
    } = req.body;

    if (!shipId || !startLocation || !endLocation || !plannedStartDate || !estimatedDistance) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ship = await ShipModel.findById(shipId);
    if (!ship) {
      return res.status(404).json({ error: 'Ship not found' });
    }

    const fuelData = await FuelUsageModel.findByShipId(shipId);
    const routeHistory = await RouteHistoryModel.findByShipId(shipId);

    let avgFuelPerMile = 0;
    if (fuelData.length > 0 && routeHistory.length > 0) {
      const totalFuel = fuelData.reduce((sum, record) => sum + record.fuelConsumed, 0);
      const totalDistance = routeHistory.reduce((sum, route) => sum + route.distance, 0);
      avgFuelPerMile = totalDistance > 0 ? totalFuel / totalDistance : 0;
    } else {
      avgFuelPerMile = ship.capacity * 0.05 / 100;
    }

    const estimatedFuelConsumption = estimatedDistance * avgFuelPerMile;

    let estimatedDuration = 0;
    if (routeHistory.length > 0) {
      const totalDuration = routeHistory.reduce((sum, route) => {
        const duration = (new Date(route.endDate) - new Date(route.startDate)) / (1000 * 60 * 60);
        return sum + duration;
      }, 0);
      const totalHistoricalDistance = routeHistory.reduce((sum, route) => sum + route.distance, 0);
      const avgSpeed = totalHistoricalDistance / totalDuration;
      estimatedDuration = estimatedDistance / (avgSpeed || 10);
    } else {
      estimatedDuration = estimatedDistance / 12;
    }

    const plannedRoute = {
      shipId,
      startLocation,
      endLocation,
      plannedStartDate: new Date(plannedStartDate),
      estimatedEndDate: new Date(new Date(plannedStartDate).getTime() + estimatedDuration * 60 * 60 * 1000),
      estimatedDistance,
      estimatedFuelConsumption,
      estimatedDuration,
      status: 'planned'
    };

    const result = await (await RouteHistoryModel.getCollection()).insertOne(plannedRoute);

    res.status(201).json({
      message: 'Route plan created successfully',
      routePlan: {
        ...plannedRoute,
        _id: result.insertedId
      }
    });
  } catch (error) {
    console.error('Error creating route plan:', error);
    res.status(500).json({ error: 'Failed to create route plan' });
  }
};

module.exports = {
  createRoutePlan
};