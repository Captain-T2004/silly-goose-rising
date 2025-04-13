const {
  ShipModel,
  RouteHistoryModel,
  FuelUsageModel,
  MaintenanceLogModel
} = require('../models');
const aiOptimizationService = require('../services/aiOptimizationService');
const weatherService = require('../services/weatherService');

const registerShip = async (req, res) => {
  try {
    const {
      shipId,
      capacity,
      fuelType,
      engineHours,
      type
    } = req.body;

    if (!shipId || capacity === undefined || !fuelType || engineHours === undefined) {
      return res.status(400).json({
        error: 'Required fields missing. shipId, capacity, fuelType, and engineHours are required'
      });
    }

    if (typeof shipId !== 'string' || typeof fuelType !== 'string') {
      return res.status(400).json({
        error: 'Invalid data types. shipId and fuelType must be strings'
      });
    }

    if (typeof capacity !== 'number' || typeof engineHours !== 'number') {
      return res.status(400).json({
        error: 'Invalid data types. capacity and engineHours must be numbers'
      });
    }

    const existingShip = await ShipModel.findById(shipId);
    if (existingShip) {
      return res.status(409).json({
        error: 'Ship with this ID already exists'
      });
    }

    const shipData = {
      shipId,
      capacity,
      fuelType,
      engineHours,
      lastUpdated: new Date()
    };

    if (type) {
      shipData.type = type;
    }

    await ShipModel.create(shipData);

    res.status(201).json({
      message: 'Ship registered successfully',
      ship: shipData
    });
  } catch (error) {
    console.error('Error registering ship:', error);
    res.status(500).json({
      error: 'Failed to register ship'
    });
  }
};

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

    if (!shipId || !startLocation || !endLocation || !plannedStartDate) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    const cargo = cargoWeight || 20000;

    const ship = await ShipModel.findById(shipId);
    if (!ship) {
      return res.status(404).json({
        error: 'Ship not found'
      });
    }

    const parsedStartDate = new Date(plannedStartDate);

    const optimizedRoute = await aiOptimizationService.optimizeRoute(
      startLocation,
      endLocation,
      cargo,
      parsedStartDate,
      ship
    );

    const routeData = {

      shipId: shipId,
      startLocation: typeof startLocation === 'object' ?
        `${startLocation.port || ''} (${startLocation.lat}, ${startLocation.lon})` : startLocation,
      endLocation: typeof endLocation === 'object' ?
        `${endLocation.port || ''} (${endLocation.lat}, ${endLocation.lon})` : endLocation,
      startDate: new Date(parsedStartDate),
      endDate: new Date(optimizedRoute.estimatedEndDate || (parsedStartDate.getTime() + (estimatedDays || 14) * 24 * 60 * 60 * 1000)),
      distance: Number(optimizedRoute.distance),

      timeTaken: Number(optimizedRoute.duration || 0),
      weather: {
        weatherConditions: optimizedRoute.weatherConditions || [],
        criticalConditions: optimizedRoute.criticalConditions || []
      },

      cargoWeight: Number(cargo || 0),
      estimatedFuelConsumption: Number(optimizedRoute.fuelConsumption ? optimizedRoute.fuelConsumption.total : 0),
      waypoints: Array.isArray(optimizedRoute.waypoints) ? optimizedRoute.waypoints : [],
      averageSpeed: Number(optimizedRoute.averageSpeed || 0),
      routeType: String(optimizedRoute.strategy || 'ai-optimized'),
      status: 'planned',
      createdAt: new Date(),
      lastUpdate: new Date()
    };

    const result = await RouteHistoryModel.create(routeData);

    const clientResponse = {
      message: 'Route plan created successfully',
      routePlan: {
        _id: result.insertedId,
        shipId,
        startLocation,
        endLocation,
        plannedStartDate: parsedStartDate,
        estimatedEndDate: routeData.endDate,
        distance: optimizedRoute.distance,
        duration: optimizedRoute.duration,
        estimatedFuelConsumption: optimizedRoute.fuelConsumption ? optimizedRoute.fuelConsumption.total : null,
        waypoints: optimizedRoute.waypoints,
        averageSpeed: optimizedRoute.averageSpeed,
        routeType: optimizedRoute.strategy || 'ai-optimized',
        weatherImpact: optimizedRoute.fuelConsumption ? optimizedRoute.fuelConsumption.weatherImpact : null,
        confidenceLevel: optimizedRoute.fuelConsumption ? optimizedRoute.fuelConsumption.confidenceLevel : 'medium',
        aiFactors: optimizedRoute.hybridFactors || null
      }
    };

    res.status(201).json(clientResponse);
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

    if (!shipId || !startLocation || !endLocation || !plannedStartDate) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    const cargo = cargoWeight || 20000;

    const ship = await ShipModel.findById(shipId);
    if (!ship) {
      return res.status(404).json({
        error: 'Ship not found'
      });
    }

    const parsedStartDate = new Date(plannedStartDate);

    const historicalRoutes = await RouteHistoryModel.findByShipId(shipId);

    const routes = historicalRoutes.map(route => {
      return RouteHistoryModel.transformRouteForApp ?
        RouteHistoryModel.transformRouteForApp(route) : route;
    });

    const fuelData = await FuelUsageModel.findByShipId(shipId);

    const weatherData = await weatherService.getRouteWeather(
      [startLocation, endLocation],
      parsedStartDate,
      new Date(parsedStartDate.getTime() + 14 * 24 * 60 * 60 * 1000)
    );

    const routeOptions = await aiOptimizationService.generateRouteOptions(
      startLocation,
      endLocation,
      cargo,
      parsedStartDate,
      ship,
      routes,
      fuelData,
      weatherData
    );

    const alternatives = routeOptions.map(route => ({
      strategy: route.strategy,
      distance: route.distance,
      duration: route.duration,
      averageSpeed: route.averageSpeed,
      waypoints: route.waypoints,
      predictedFuelConsumption: route.predictedFuelConsumption,
      startLocation,
      endLocation,
      estimatedStartDate: parsedStartDate,
      estimatedEndDate: new Date(parsedStartDate.getTime() + (route.duration * 60 * 60 * 1000))
    }));

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

    const appRoute = RouteHistoryModel.transformRouteForApp ?
      RouteHistoryModel.transformRouteForApp(route) : route;

    const ship = await ShipModel.findById(appRoute.shipId);

    if (!ship) {
      return res.status(404).json({
        error: 'Ship not found'
      });
    }

    const waypoints = appRoute.waypoints || [];

    if (waypoints.length === 0) {
      return res.status(400).json({
        error: 'Route has no waypoints defined'
      });
    }

    const waypointCoords = waypoints.map(wp => ({
      lat: wp[1],
      lon: wp[0]
    }));

    const updatedWeather = await weatherService.getRouteWeather(
      waypointCoords,
      new Date(appRoute.plannedStartDate || appRoute.startDate),
      new Date(appRoute.estimatedEndDate || appRoute.endDate)
    );

    const optimizedRoute = await aiOptimizationService.optimizeRoute({
        lat: waypoints[0][1],
        lon: waypoints[0][0],
        port: typeof appRoute.startLocation === 'string' ?
          appRoute.startLocation.split(' (')[0] : appRoute.startLocation.port
      }, {
        lat: waypoints[waypoints.length - 1][1],
        lon: waypoints[waypoints.length - 1][0],
        port: typeof appRoute.endLocation === 'string' ?
          appRoute.endLocation.split(' (')[0] : appRoute.endLocation.port
      },
      appRoute.cargoWeight || 20000,
      new Date(appRoute.plannedStartDate || appRoute.startDate),
      ship
    );

    await RouteHistoryModel.updateRoute(routeId, {
      weather: {
        weatherConditions: updatedWeather,
        criticalConditions: optimizedRoute.criticalConditions || []
      },
      waypoints: optimizedRoute.waypoints,
      endDate: new Date(optimizedRoute.estimatedEndDate),
      timeTaken: Number(optimizedRoute.duration),
      distance: Number(optimizedRoute.distance),
      lastUpdate: new Date()
    });

    const response = {
      message: 'Route updated with latest weather and optimization',
      updatedRoute: {
        _id: routeId,
        shipId: appRoute.shipId,
        startLocation: appRoute.startLocation,
        endLocation: appRoute.endLocation,
        plannedStartDate: appRoute.plannedStartDate || appRoute.startDate,
        estimatedEndDate: optimizedRoute.estimatedEndDate,
        distance: optimizedRoute.distance,
        duration: optimizedRoute.duration,
        waypoints: optimizedRoute.waypoints,
        averageSpeed: optimizedRoute.averageSpeed,
        routeType: optimizedRoute.strategy || 'ai-optimized',
        weatherImpact: optimizedRoute.fuelConsumption ? optimizedRoute.fuelConsumption.weatherImpact : null,
        fuelConsumption: optimizedRoute.fuelConsumption ? optimizedRoute.fuelConsumption.total : null
      }
    };

    res.status(200).json(response);
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

    const route = await RouteHistoryModel.findById(routeId);

    if (fuelConsumed > 0 && route) {
      await FuelUsageModel.create({
        shipId: route.shipId,
        routeId: routeId,
        date: new Date(actualEndDate),
        fuelConsumed,
        distance: actualDistance,
        duration: actualDuration,
        speed: actualDistance / actualDuration
      });

      const maintenanceNeeded = await checkMaintenanceNeeded(route.shipId, actualDistance, actualDuration);

      if (maintenanceNeeded.isNeeded) {
        await createMaintenanceRecommendation(route.shipId, maintenanceNeeded);

        return res.status(200).json({
          message: 'Route marked as completed successfully',
          maintenanceAlert: {
            isNeeded: true,
            type: maintenanceNeeded.type,
            reason: maintenanceNeeded.reason,
            recommendedDate: maintenanceNeeded.recommendedDate
          }
        });
      }
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

async function checkMaintenanceNeeded(shipId, lastRouteDistance, lastRouteDuration) {
  try {

    const ship = await ShipModel.findById(shipId);
    if (!ship) {
      return {
        isNeeded: false
      };
    }

    const routes = await RouteHistoryModel.findByShipId(shipId);
    const completedRoutes = routes.filter(r => r.status === 'completed');

    const maintenanceHistory = await MaintenanceLogModel.findByShipId(shipId);

    const updatedEngineHours = (ship.engineHours || 0) + lastRouteDuration;
    await ShipModel.update(shipId, {
      engineHours: updatedEngineHours
    });

    const maintenanceThresholds = getMaintenanceThresholds(ship);

    const lastMaintenanceDates = {};
    const mileageSinceLastMaintenance = {};
    const hoursSinceLastMaintenance = {};

    maintenanceHistory.forEach(maintenance => {
      const type = maintenance.maintenanceType;

      if (!lastMaintenanceDates[type] || new Date(maintenance.maintenanceDate) > new Date(lastMaintenanceDates[type])) {
        lastMaintenanceDates[type] = maintenance.maintenanceDate;

        const maintDate = new Date(maintenance.maintenanceDate);
        const routesSinceMaint = completedRoutes.filter(route => new Date(route.endDate) > maintDate);

        mileageSinceLastMaintenance[type] = routesSinceMaint.reduce((sum, route) => sum + (route.distance || 0), 0);
        hoursSinceLastMaintenance[type] = routesSinceMaint.reduce((sum, route) => sum + (route.timeTaken || route.duration || 0), 0);
      }
    });

    for (const [type, threshold] of Object.entries(maintenanceThresholds)) {
      const lastMaintenance = lastMaintenanceDates[type];
      const daysSinceLastMaintenance = lastMaintenance ?
        (Date.now() - new Date(lastMaintenance).getTime()) / (1000 * 60 * 60 * 24) :
        Infinity;

      if (daysSinceLastMaintenance > threshold.days) {
        return {
          isNeeded: true,
          type,
          reason: `Time-based maintenance required (${daysSinceLastMaintenance.toFixed(0)} days since last ${type} maintenance, threshold is ${threshold.days} days)`,
          recommendedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
      }

      if (threshold.mileage && (mileageSinceLastMaintenance[type] || 0) > threshold.mileage) {
        return {
          isNeeded: true,
          type,
          reason: `Mileage-based maintenance required (${mileageSinceLastMaintenance[type].toFixed(0)} miles since last ${type} maintenance, threshold is ${threshold.mileage} miles)`,
          recommendedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
      }

      if (threshold.engineHours && (hoursSinceLastMaintenance[type] || 0) > threshold.engineHours) {
        return {
          isNeeded: true,
          type,
          reason: `Engine hours-based maintenance required (${hoursSinceLastMaintenance[type].toFixed(0)} hours since last ${type} maintenance, threshold is ${threshold.engineHours} hours)`,
          recommendedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
      }
    }

    return {
      isNeeded: false
    };
  } catch (error) {
    console.error('Error checking if maintenance is needed:', error);
    return {
      isNeeded: false
    };
  }
}

function getMaintenanceThresholds(ship) {

  const thresholds = {
    routine: {
      days: 90,
      mileage: 10000,
      engineHours: 500
    },
    inspection: {
      days: 180,
      mileage: 20000
    },
    overhaul: {
      days: 730,
      engineHours: 10000
    },
    repair: {
      days: 365
    }
  };

  if (ship.type === 'tanker') {
    thresholds.routine.days = 75;
    thresholds.inspection.days = 150;
  } else if (ship.type === 'passenger') {
    thresholds.routine.days = 60;
    thresholds.inspection.days = 120;
  }

  const buildDate = new Date(ship.buildDate || Date.now());
  const ageInYears = (Date.now() - buildDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

  if (ageInYears > 15) {

    Object.keys(thresholds).forEach(type => {
      if (thresholds[type].days) {
        thresholds[type].days = Math.round(thresholds[type].days * 0.8);
      }
      if (thresholds[type].mileage) {
        thresholds[type].mileage = Math.round(thresholds[type].mileage * 0.8);
      }
      if (thresholds[type].engineHours) {
        thresholds[type].engineHours = Math.round(thresholds[type].engineHours * 0.8);
      }
    });
  } else if (ageInYears < 5) {

    Object.keys(thresholds).forEach(type => {
      if (thresholds[type].days) {
        thresholds[type].days = Math.round(thresholds[type].days * 1.2);
      }
      if (thresholds[type].mileage) {
        thresholds[type].mileage = Math.round(thresholds[type].mileage * 1.2);
      }
      if (thresholds[type].engineHours) {
        thresholds[type].engineHours = Math.round(thresholds[type].engineHours * 1.2);
      }
    });
  }

  return thresholds;
}

async function createMaintenanceRecommendation(shipId, maintenanceInfo) {
  try {

    const recommendation = {
      shipId,
      maintenanceType: maintenanceInfo.type,
      recommendedDate: maintenanceInfo.recommendedDate,
      reason: maintenanceInfo.reason,
      status: 'recommended',
      createdAt: new Date()
    };

    return recommendation;
  } catch (error) {
    console.error('Error creating maintenance recommendation:', error);
    return null;
  }
}

const getOptimalSpeed = async (req, res) => {
  try {
    const {
      routeId,
      currentPosition,
      remainingFuel
    } = req.query;

    if (!routeId || !currentPosition) {
      return res.status(400).json({
        error: 'Route ID and current position are required'
      });
    }

    let position;
    try {
      position = JSON.parse(currentPosition);
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid position format'
      });
    }

    const route = await RouteHistoryModel.findByIdAndTransform(routeId);

    if (!route) {
      return res.status(404).json({
        error: 'Route not found'
      });
    }

    const ship = await ShipModel.findById(route.shipId);

    if (!ship) {
      return res.status(404).json({
        error: 'Ship not found'
      });
    }

    const remainingDistance = calculateRemainingDistance(position, route.waypoints);

    const remainingWaypoints = filterRemainingWaypoints(position, route.waypoints);
    const waypointCoords = remainingWaypoints.map(wp => ({
      lat: wp[1],
      lon: wp[0]
    }));

    const weatherData = await weatherService.getRouteWeather(
      waypointCoords,
      new Date(),
      new Date(route.estimatedEndDate || route.endDate)
    );

    let optimalSpeed = 20;
    let adjustmentReason = "Standard optimal speed";

    if (weatherData && weatherData.length > 0) {
      const hasAdverseWeather = weatherData.some(wp => {
        return wp.forecast && wp.forecast.some(f =>
          (f.wind && f.wind.speed > 15) ||
          (f.weather && f.weather[0] &&
            (f.weather[0].main === 'Storm' ||
              f.weather[0].main === 'Rain' && f.weather[0].description.includes('heavy')))
        );
      });

      if (hasAdverseWeather) {
        optimalSpeed *= 0.85;
        adjustmentReason = "Reduced speed due to adverse weather conditions";
      }
    }

    if (remainingFuel) {
      const fuelFloat = parseFloat(remainingFuel);
      const cargoWeight = route.cargoWeight || 20000;

      const fuelRate = 0.08 * Math.pow(optimalSpeed / 20, 1.5) * (0.7 + (cargoWeight / 30000) * 0.6);
      const estimatedFuelNeeded = remainingDistance * fuelRate;

      if (fuelFloat < estimatedFuelNeeded * 1.2) {
        const conservationFactor = Math.max(0.7, fuelFloat / (estimatedFuelNeeded * 1.2));
        optimalSpeed *= conservationFactor;
        adjustmentReason = "Speed reduced to conserve fuel";
      }
    }

    const targetArrival = new Date(route.estimatedEndDate || route.endDate);
    const currentTime = new Date();
    const hoursRemaining = (targetArrival - currentTime) / (1000 * 60 * 60);

    if (hoursRemaining > 0) {
      const requiredSpeed = remainingDistance / hoursRemaining;

      if (requiredSpeed > optimalSpeed * 1.1) {

        optimalSpeed = Math.min(requiredSpeed, optimalSpeed * 1.3);
        adjustmentReason = "Speed increased to meet arrival schedule";
      } else if (requiredSpeed < optimalSpeed * 0.9) {

        optimalSpeed = Math.max(requiredSpeed, optimalSpeed * 0.7);
        adjustmentReason = "Speed decreased for fuel efficiency while maintaining schedule";
      }
    }

    optimalSpeed = Math.round(optimalSpeed * 10) / 10;

    res.status(200).json({
      routeId,
      currentPosition: position,
      remainingDistance,
      optimalSpeed,
      adjustmentReason,
      estimatedArrival: new Date(currentTime.getTime() + (remainingDistance / optimalSpeed) * 60 * 60 * 1000)
    });
  } catch (error) {
    console.error('Error calculating optimal speed:', error);
    res.status(500).json({
      error: 'Failed to calculate optimal speed'
    });
  }
};

function calculateRemainingDistance(currentPosition, waypoints) {
  if (!waypoints || waypoints.length < 2) {
    return 0;
  }

  const turf = require('@turf/turf');
  const currentPoint = turf.point([currentPosition.lon, currentPosition.lat]);

  let nearestIdx = 0;
  let minDistance = Infinity;

  waypoints.forEach((wp, idx) => {
    const wpPoint = turf.point(wp);
    const distance = turf.distance(currentPoint, wpPoint, {
      units: 'kilometers'
    });

    if (distance < minDistance) {
      minDistance = distance;
      nearestIdx = idx;
    }
  });

  let remainingDistance = 0;

  for (let i = nearestIdx; i < waypoints.length - 1; i++) {
    const pt1 = turf.point(waypoints[i]);
    const pt2 = turf.point(waypoints[i + 1]);
    remainingDistance += turf.distance(pt1, pt2, {
      units: 'kilometers'
    });
  }

  remainingDistance += minDistance;

  return remainingDistance;
}

function filterRemainingWaypoints(currentPosition, waypoints) {
  if (!waypoints || waypoints.length < 2) {
    return [];
  }

  const turf = require('@turf/turf');
  const currentPoint = turf.point([currentPosition.lon, currentPosition.lat]);

  let nearestIdx = 0;
  let minDistance = Infinity;

  waypoints.forEach((wp, idx) => {
    const wpPoint = turf.point(wp);
    const distance = turf.distance(currentPoint, wpPoint, {
      units: 'kilometers'
    });

    if (distance < minDistance) {
      minDistance = distance;
      nearestIdx = idx;
    }
  });

  return waypoints.slice(nearestIdx);
}

const scheduleMaintenance = async (req, res) => {
  try {
    const {
      shipId,
      maintenanceType,
      maintenanceDate,
      notes,
      technician
    } = req.body;

    if (!shipId || !maintenanceType || !maintenanceDate) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    const validTypes = ['routine', 'repair', 'overhaul', 'emergency', 'inspection'];
    if (!validTypes.includes(maintenanceType)) {
      return res.status(400).json({
        error: 'Invalid maintenance type'
      });
    }

    const ship = await ShipModel.findById(shipId);
    if (!ship) {
      return res.status(404).json({
        error: 'Ship not found'
      });
    }

    const maintenanceData = {
      shipId,
      maintenanceDate: new Date(maintenanceDate),
      maintenanceType,
      engineHoursAtMaintenance: ship.engineHours || 0,
      notes: notes || '',
      technician: technician || 'Not assigned',
      issuesFound: [],
      maintenanceCost: 0
    };

    const result = await MaintenanceLogModel.create(maintenanceData);

    res.status(201).json({
      message: 'Maintenance scheduled successfully',
      maintenanceId: result.insertedId,
      scheduledDate: new Date(maintenanceDate)
    });
  } catch (error) {
    console.error('Error scheduling maintenance:', error);
    res.status(500).json({
      error: 'Failed to schedule maintenance'
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
  completeRoute,
  getOptimalSpeed,
  scheduleMaintenance,
  registerShip
};