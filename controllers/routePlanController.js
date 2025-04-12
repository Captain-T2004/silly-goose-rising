const {
  ShipModel,
  RouteHistoryModel,
  FuelUsageModel
} = require('../models');
const routeOptimizationService = require('../services/routeOptimizationService');
const weatherService = require('../services/weatherService');

const createRoutePlan = async (req, res) => {
  try {
    const {
      shipId,
      startLocation,
      endLocation,
      plannedStartDate,
      cargoWeight,
      estimatedDays
    } = req.body;

    if (!shipId || !startLocation || !endLocation || !plannedStartDate || !cargoWeight) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    const ship = await ShipModel.findById(shipId);
    if (!ship) {
      return res.status(404).json({
        error: 'Ship not found'
      });
    }


    const parsedStartDate = new Date(plannedStartDate);


    const optimizedRoute = await routeOptimizationService.optimizeRoute(
      startLocation,
      endLocation,
      cargoWeight,
      parsedStartDate,
      estimatedDays
    );


    const routeData = {
      shipId,
      startLocation: typeof startLocation === 'object' ?
        `${startLocation.port || ''} (${startLocation.lat}, ${startLocation.lon})` : startLocation,
      endLocation: typeof endLocation === 'object' ?
        `${endLocation.port || ''} (${endLocation.lat}, ${endLocation.lon})` : endLocation,
      startDate: parsedStartDate,
      endDate: optimizedRoute.estimatedEndDate,
      distance: optimizedRoute.distance,
      timeTaken: optimizedRoute.duration,
      weather: {
        weatherConditions: optimizedRoute.weatherConditions,
        criticalConditions: optimizedRoute.criticalConditions
      },

      cargoWeight,
      estimatedFuelConsumption: optimizedRoute.fuelConsumption,
      waypoints: optimizedRoute.waypoints,
      averageSpeed: optimizedRoute.averageSpeed,
      routeType: optimizedRoute.routeType,
      status: 'planned',
      createdAt: new Date(),
      lastUpdate: new Date()
    };

    const result = await RouteHistoryModel.create(routeData);

    res.status(201).json({
      message: 'Route plan created successfully',
      routePlan: {
        ...routeData,
        _id: result.insertedId
      }
    });
  } catch (error) {
    console.error('Error creating route plan:', error);
    res.status(500).json({
      error: 'Failed to create route plan'
    });
  }
};

const getShipRoutes = async (req, res) => {
  try {
    const {
      shipId
    } = req.params;

    if (!shipId) {
      return res.status(400).json({
        error: 'Ship ID is required'
      });
    }

    const routes = await RouteHistoryModel.findByShipIdAndTransform(shipId);

    res.status(200).json({
      routes
    });
  } catch (error) {
    console.error('Error fetching ship routes:', error);
    res.status(500).json({
      error: 'Failed to fetch routes'
    });
  }
};

const getRouteById = async (req, res) => {
  try {
    const {
      routeId
    } = req.params;

    if (!routeId) {
      return res.status(400).json({
        error: 'Route ID is required'
      });
    }

    const route = await RouteHistoryModel.findByIdAndTransform(routeId);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    res.status(200).json({
      route
    });
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({
      error: 'Failed to fetch route'
    });
  }
};

const updateRouteStatus = async (req, res) => {
  try {
    const {
      routeId
    } = req.params;
    const {
      status
    } = req.body;

    if (!routeId || !status) {
      return res.status(400).json({
        error: 'Route ID and status are required'
      });
    }


    const validStatuses = ['planned', 'in-progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status value'
      });
    }

    const result = await RouteHistoryModel.updateRouteStatus(routeId, status);

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        error: 'Route not found or status not changed'
      });
    }

    res.status(200).json({
      message: 'Route status updated successfully'
    });
  } catch (error) {
    console.error('Error updating route status:', error);
    res.status(500).json({
      error: 'Failed to update route status'
    });
  }
};

const generateAlternativeRoutes = async (req, res) => {
  try {
    const {
      shipId,
      startLocation,
      endLocation,
      plannedStartDate,
      cargoWeight
    } = req.body;

    if (!shipId || !startLocation || !endLocation || !plannedStartDate || !cargoWeight) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    const ship = await ShipModel.findById(shipId);
    if (!ship) {
      return res.status(404).json({
        error: 'Ship not found'
      });
    }


    const parsedStartDate = new Date(plannedStartDate);


    const alternatives = await routeOptimizationService.generateAlternativeRoutes(
      startLocation,
      endLocation,
      cargoWeight,
      parsedStartDate
    );

    res.status(200).json({
      alternatives
    });
  } catch (error) {
    console.error('Error generating alternative routes:', error);
    res.status(500).json({
      error: 'Failed to generate alternative routes'
    });
  }
};

const updateRouteWeather = async (req, res) => {
  try {
    const {
      routeId
    } = req.params;

    if (!routeId) {
      return res.status(400).json({
        error: 'Route ID is required'
      });
    }


    const route = await RouteHistoryModel.findById(routeId);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }


    const updatedWeather = await weatherService.getRouteWeather(
      route.waypoints.map(wp => ({
        lat: wp[1],
        lon: wp[0]
      })),
      new Date(route.plannedStartDate),
      new Date(route.estimatedEndDate)
    );


    const criticalConditions = await weatherService.getCriticalConditions(
      route.waypoints.map(wp => ({
        lat: wp[1],
        lon: wp[0]
      })),
      new Date(route.plannedStartDate),
      new Date(route.estimatedEndDate)
    );


    await RouteHistoryModel.updateWeatherData(routeId, updatedWeather);


    if (criticalConditions.length > 0) {
      await RouteHistoryModel.updateRoute(routeId, {
        criticalConditions,
        lastUpdate: new Date()
      });
    }

    res.status(200).json({
      message: 'Route weather data updated successfully',
      weatherData: updatedWeather,
      criticalConditions
    });
  } catch (error) {
    console.error('Error updating route weather:', error);
    res.status(500).json({
      error: 'Failed to update route weather data'
    });
  }
};

const completeRoute = async (req, res) => {
  try {
    const {
      routeId
    } = req.params;
    const {
      actualEndDate,
      actualDistance,
      actualDuration,
      fuelConsumed
    } = req.body;

    if (!routeId || !actualEndDate || !actualDistance || !actualDuration || fuelConsumed === undefined) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }


    const result = await RouteHistoryModel.completeRoute(
      routeId,
      actualEndDate,
      actualDistance,
      actualDuration,
      fuelConsumed
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        error: 'Route not found or already completed'
      });
    }

    res.status(200).json({
      message: 'Route marked as completed successfully'
    });
  } catch (error) {
    console.error('Error completing route:', error);
    res.status(500).json({
      error: 'Failed to complete route'
    });
  }
};

module.exports = {
  createRoutePlan,
  getShipRoutes,
  getRouteById,
  updateRouteStatus,
  generateAlternativeRoutes,
  updateRouteWeather,
  completeRoute
};