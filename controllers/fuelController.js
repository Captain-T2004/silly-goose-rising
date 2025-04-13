const {
  ShipModel,
  RouteHistoryModel,
  FuelUsageModel
} = require('../models');
const weatherService = require('../services/weatherService');
const routeOptimizationService = require('../services/routeOptimizationService');

const getFuelEstimate = async (req, res) => {
  try {
    const {
      shipId,
      startLocation_lat,
      startLocation_lon,
      endLocation_lat,
      endLocation_lon,
      plannedStartDate,
      cargoWeight,
      routeId
    } = req.query;


    if (!routeId && !shipId) {
      return res.status(400).json({
        error: 'Either routeId or shipId is required'
      });
    }


    if (routeId) {
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


      const fuelHistory = await FuelUsageModel.findByShipId(appRoute.shipId);


      const weatherData = await weatherService.getRouteWeather(
        appRoute.waypoints?.map(wp => ({
          lat: wp[1],
          lon: wp[0]
        })) || [],
        new Date(appRoute.plannedStartDate || appRoute.startDate),
        new Date(appRoute.estimatedEndDate || appRoute.endDate)
      );


      const fuelEstimate = calculateFuelConsumption(
        appRoute,
        ship,
        fuelHistory,
        weatherData
      );

      return res.status(200).json({
        routeId: routeId,
        shipId: appRoute.shipId,
        fuelEstimate: {
          totalFuelConsumption: fuelEstimate.totalConsumption,
          fuelConsumptionBySegment: fuelEstimate.segmentConsumption,
          averageFuelConsumptionPerHour: fuelEstimate.averagePerHour,
          averageFuelConsumptionPerMile: fuelEstimate.averagePerMile,
          weatherImpact: fuelEstimate.weatherImpact,
          confidenceLevel: fuelEstimate.confidenceLevel
        },
        fuelEfficiencyTips: generateFuelEfficiencyTips(ship, appRoute, fuelEstimate)
      });
    } else {

      if (!shipId || !startLocation_lat || !startLocation_lon || !endLocation_lat || !endLocation_lon || !plannedStartDate || !cargoWeight) {
        return res.status(400).json({
          error: 'Missing required parameters. shipId, startLocation, endLocation, plannedStartDate, and cargoWeight are required'
        });
      }
      const startLocation = {
        "lat": startLocation_lat,
        "lon": startLocation_lon
      };
      const endLocation = {
        "lat": endLocation_lat,
        "lon": endLocation_lon
      };
      const ship = await ShipModel.findById(shipId);

      if (!ship) {
        return res.status(404).json({
          error: 'Ship not found'
        });
      }


      const startDate = new Date(plannedStartDate);
      const optimizedRoute = await routeOptimizationService.optimizeRoute(
        startLocation,
        endLocation,
        cargoWeight,
        startDate
      );


      const fuelHistory = await FuelUsageModel.findByShipId(shipId);


      const fuelEstimate = calculateFuelConsumption({
          distance: optimizedRoute.distance,
          duration: optimizedRoute.duration,
          averageSpeed: optimizedRoute.averageSpeed,
          waypoints: optimizedRoute.waypoints,
          cargoWeight: cargoWeight
        },
        ship,
        fuelHistory,
        optimizedRoute.weatherConditions
      );

      return res.status(200).json({
        shipId: shipId,
        estimatedRoute: {
          startLocation,
          endLocation,
          distance: optimizedRoute.distance,
          duration: optimizedRoute.duration,
          averageSpeed: optimizedRoute.averageSpeed
        },
        fuelEstimate: {
          totalFuelConsumption: fuelEstimate.totalConsumption,
          fuelConsumptionBySegment: fuelEstimate.segmentConsumption,
          averageFuelConsumptionPerHour: fuelEstimate.averagePerHour,
          averageFuelConsumptionPerMile: fuelEstimate.averagePerMile,
          weatherImpact: fuelEstimate.weatherImpact,
          confidenceLevel: fuelEstimate.confidenceLevel
        },
        fuelEfficiencyTips: generateFuelEfficiencyTips(ship, optimizedRoute, fuelEstimate)
      });
    }
  } catch (error) {
    console.error('Error calculating fuel estimate:', error);
    res.status(500).json({
      error: 'Failed to calculate fuel estimate'
    });
  }
};

const calculateFuelConsumption = (route, ship, fuelHistory, weatherData) => {

  let baseFuelRate = 0.08;


  if (fuelHistory && fuelHistory.length > 0) {

    const totalFuel = fuelHistory.reduce((sum, record) => sum + record.fuelConsumed, 0);
    const totalDistance = fuelHistory.reduce((sum, record) => sum + record.distance, 0);

    if (totalDistance > 0) {
      const historicalRate = totalFuel / totalDistance;

      baseFuelRate = (historicalRate * 0.7) + (baseFuelRate * 0.3);
    }
  }


  const shipAgeYears = (new Date() - new Date(ship.buildDate)) / (1000 * 60 * 60 * 24 * 365);
  const ageMultiplier = 1 + (Math.max(0, shipAgeYears - 5) * 0.01);


  let shipTypeMultiplier = 1.0;
  if (ship.type === 'tanker') shipTypeMultiplier = 1.2;
  if (ship.type === 'container') shipTypeMultiplier = 1.1;
  if (ship.type === 'bulk') shipTypeMultiplier = 0.9;


  const capacityUtilization = route.cargoWeight / ship.capacity;
  const cargoMultiplier = 0.7 + (capacityUtilization * 0.6);


  const speedFactor = Math.pow(route.averageSpeed / 20, 1.5);


  let weatherMultiplier = 1.0;
  let weatherImpactDetails = [];

  if (weatherData && weatherData.length > 0) {
    let totalWeatherImpact = 0;

    weatherData.forEach((location, index) => {
      if (location.forecast && location.forecast.length > 0) {

        const segmentWeather = location.forecast.reduce((acc, item) => {
          acc.windSpeed += item.wind?.speed || 0;
          acc.precipitation += item.rain?.['3h'] || item.snow?.['3h'] || 0;
          acc.temperature += item.main?.temp || 0;
          return acc;
        }, {
          windSpeed: 0,
          precipitation: 0,
          temperature: 0
        });


        const avgItems = location.forecast.length;
        segmentWeather.windSpeed /= avgItems;
        segmentWeather.precipitation /= avgItems;
        segmentWeather.temperature /= avgItems;


        let segmentImpact = 1.0;


        if (segmentWeather.windSpeed > 10) {
          const windImpact = 1 + ((segmentWeather.windSpeed - 10) / 5 * 0.02);
          segmentImpact *= windImpact;

          weatherImpactDetails.push({
            segment: index,
            factor: 'wind',
            value: segmentWeather.windSpeed,
            impact: ((windImpact - 1) * 100).toFixed(1) + '%'
          });
        }


        if (segmentWeather.precipitation > 0) {
          const precipImpact = 1 + (segmentWeather.precipitation * 0.01);
          segmentImpact *= precipImpact;

          weatherImpactDetails.push({
            segment: index,
            factor: 'precipitation',
            value: segmentWeather.precipitation,
            impact: ((precipImpact - 1) * 100).toFixed(1) + '%'
          });
        }


        const tempDiff = Math.abs(segmentWeather.temperature - 15);
        if (tempDiff > 5) {
          const tempImpact = 1 + (tempDiff / 5 * 0.005);
          segmentImpact *= tempImpact;

          weatherImpactDetails.push({
            segment: index,
            factor: 'temperature',
            value: segmentWeather.temperature,
            impact: ((tempImpact - 1) * 100).toFixed(1) + '%'
          });
        }

        totalWeatherImpact += segmentImpact;
      }
    });


    if (weatherData.length > 0) {
      weatherMultiplier = totalWeatherImpact / weatherData.length;
    }
  }


  const totalConsumption = route.distance * baseFuelRate * shipTypeMultiplier *
    ageMultiplier * cargoMultiplier * speedFactor * weatherMultiplier;

  const validatedTotalConsumption = isNaN(totalConsumption) || totalConsumption === undefined ? calculateDefaultConsumption(route, ship) : totalConsumption;


  let segmentConsumption = [];

  if (route.waypoints && route.waypoints.length > 1) {
    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const pt1 = {
        lon: route.waypoints[i][0],
        lat: route.waypoints[i][1]
      };
      const pt2 = {
        lon: route.waypoints[i + 1][0],
        lat: route.waypoints[i + 1][1]
      };


      const segmentDist = calculateDistance(pt1, pt2);


      const segmentConsump = segmentDist * baseFuelRate * shipTypeMultiplier *
        ageMultiplier * cargoMultiplier * speedFactor *
        (weatherData && weatherData[i] ? weatherMultiplier : 1.0);

      segmentConsumption.push({
        from: i,
        to: i + 1,
        distance: segmentDist,
        consumption: segmentConsump
      });
    }
  }

  const segmentConsum = segmentConsumption.map(segment => ({
    ...segment,
    consumption: isNaN(segment.consumption) ? segment.distance * 0.08 : segment.consumption
  }));


  const hasGoodHistoricalData = fuelHistory && fuelHistory.length >= 5;
  const hasGoodWeatherData = weatherData && weatherData.length > 0 &&
    weatherData[0].forecast && weatherData[0].forecast.length > 0;
  const hasGoodShipData = ship.buildDate && ship.type && ship.capacity;

  let confidenceLevel = 'medium';
  if (hasGoodHistoricalData && hasGoodWeatherData && hasGoodShipData) {
    confidenceLevel = 'high';
  } else if (!hasGoodHistoricalData && !hasGoodWeatherData) {
    confidenceLevel = 'low';
  }

  return {
    totalConsumption: validatedTotalConsumption,
    segmentConsumption: segmentConsum,
    averagePerHour: validatedTotalConsumption / (route.duration || 1),
    averagePerMile: validatedTotalConsumption / (route.distance || 1),
    weatherImpact: {
      multiplier: isNaN(weatherMultiplier) ? 1.0 : weatherMultiplier,
      details: weatherImpactDetails
    },
    confidenceLevel: confidenceLevel
  };
};

const calculateDefaultConsumption = (route, ship) => {
  console.log(ship);
  const defaultRate = 0.08;
  return route.distance * defaultRate;
};

const calculateDistance = (pt1, pt2) => {
  const R = 6371;
  const dLat = (pt2.lat - pt1.lat) * Math.PI / 180;
  const dLon = (pt2.lon - pt1.lon) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(pt1.lat * Math.PI / 180) * Math.cos(pt2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const generateFuelEfficiencyTips = (ship, route, fuelEstimate) => {
  const tips = [];


  if (route.averageSpeed > 18) {
    tips.push({
      category: 'speed',
      tip: 'Reducing speed by 10% could reduce fuel consumption by approximately 20%',
      potentialSavings: '15-25%',
      priority: 'high'
    });
  }


  if (fuelEstimate.weatherImpact.multiplier > 1.1) {
    tips.push({
      category: 'weather',
      tip: 'Consider alternative routes to avoid adverse weather conditions',
      potentialSavings: `${((fuelEstimate.weatherImpact.multiplier - 1) * 100).toFixed(1)}%`,
      priority: 'medium'
    });
  }


  const shipAgeYears = (new Date() - new Date(ship.buildDate)) / (1000 * 60 * 60 * 24 * 365);
  if (shipAgeYears > 10) {
    tips.push({
      category: 'maintenance',
      tip: 'Consider hull cleaning and engine maintenance to improve fuel efficiency',
      potentialSavings: '5-10%',
      priority: 'medium'
    });
  }


  tips.push({
    category: 'cargo',
    tip: 'Ensure optimal cargo distribution for stability and fuel efficiency',
    potentialSavings: '2-5%',
    priority: 'low'
  });

  return tips;
};

module.exports = {
  getFuelEstimate
};