const weatherService = require('./weatherService');
const turf = require('@turf/turf');
const {
  RouteHistoryModel,
  FuelUsageModel,
  ShipModel
} = require('../models');

class AIOptimizationService {
  async optimizeRoute(startLocation, endLocation, cargoWeight, plannedStartDate, ship) {
    try {
      const historicalRoutes = await RouteHistoryModel.findByShipId(ship.shipId);
      const fuelData = await FuelUsageModel.findByShipId(ship.shipId);

      const routes = historicalRoutes.map(route => {
        return RouteHistoryModel.transformRouteForApp ?
          RouteHistoryModel.transformRouteForApp(route) : route;
      });

      const baseRoute = this.generateBaseRoute(startLocation, endLocation);
      const weatherData = await this.getWeatherForecast(baseRoute.waypoints, plannedStartDate);
      console.log * (weatherData);

      const routeOptions = await this.generateRouteOptions(
        startLocation,
        endLocation,
        cargoWeight,
        plannedStartDate,
        ship,
        routes,
        fuelData,
        weatherData
      );

      const optimalRoute = this.selectOptimalRoute(routeOptions, routes, weatherData);

      const enrichedRoute = await this.predictFuelConsumption(
        optimalRoute,
        ship,
        cargoWeight,
        weatherData,
        fuelData,
        routes
      );

      return enrichedRoute;
    } catch (error) {
      console.error('Error in AI route optimization:', error);
      throw new Error('Failed to generate AI-optimized route');
    }
  }

  async generateRouteOptions(
    startLocation,
    endLocation,
    cargoWeight,
    plannedStartDate,
    ship,
    historicalRoutes,
    fuelData,
    weatherData
  ) {
    const baseRoute = this.generateBaseRoute(startLocation, endLocation);

    const routeOptions = [{
      ...baseRoute,
      strategy: 'direct',
      predictedFuelConsumption: null
    }];

    const weatherRoute = await this.generateWeatherOptimizedRoute(
      startLocation,
      endLocation,
      weatherData,
      plannedStartDate
    );
    routeOptions.push({
      ...weatherRoute,
      strategy: 'weather-optimized',
      predictedFuelConsumption: null
    });

    const fuelRoute = await this.generateFuelOptimizedRoute(
      startLocation,
      endLocation,
      cargoWeight,
      ship,
      fuelData
    );
    routeOptions.push({
      ...fuelRoute,
      strategy: 'fuel-optimized',
      predictedFuelConsumption: null
    });

    if (historicalRoutes.length > 0) {
      const historicalRoute = await this.generateHistoricalLearningRoute(
        startLocation,
        endLocation,
        historicalRoutes,
        fuelData
      );
      routeOptions.push({
        ...historicalRoute,
        strategy: 'historical-learning',
        predictedFuelConsumption: null
      });
    }

    const hybridRoute = await this.generateHybridRoute(
      routeOptions,
      weatherData,
      cargoWeight,
      ship
    );
    routeOptions.push({
      ...hybridRoute,
      strategy: 'hybrid',
      predictedFuelConsumption: null
    });
    for (let i = 0; i < routeOptions.length; i++) {
      routeOptions[i].predictedFuelConsumption = await this.calculateBaseFuelConsumption(
        routeOptions[i],
        ship,
        cargoWeight,
        weatherData
      );
    }

    return routeOptions;
  }

  generateBaseRoute(startLocation, endLocation) {
    const startPoint = turf.point([startLocation.lon, startLocation.lat]);
    const endPoint = turf.point([endLocation.lon, endLocation.lat]);

    const directLine = turf.lineString([
      startPoint.geometry.coordinates,
      endPoint.geometry.coordinates
    ]);

    const totalDistance = turf.length(directLine, {
      units: 'kilometers'
    });

    const numWaypoints = Math.max(20, Math.ceil(totalDistance / 200));
    const waypoints = [startPoint.geometry.coordinates];

    for (let i = 1; i < numWaypoints; i++) {
      const point = turf.along(directLine, (totalDistance * i) / numWaypoints, {
        units: 'kilometers'
      });
      waypoints.push(point.geometry.coordinates);
    }

    waypoints.push(endPoint.geometry.coordinates);

    const baseSpeed = 22;
    const duration = totalDistance / baseSpeed;

    return {
      waypoints,
      distance: totalDistance,
      duration: duration,
      averageSpeed: baseSpeed,
      startLocation,
      endLocation
    };
  }

  async generateWeatherOptimizedRoute(startLocation, endLocation, weatherData, plannedStartDate) {
    const baseRoute = this.generateBaseRoute(startLocation, endLocation);
    const waypoints = [...baseRoute.waypoints];

    if (!weatherData || weatherData.length === 0) {
      return baseRoute;
    }

    const waypointsWithAdverseWeather = [];

    weatherData.forEach((wpWeather, index) => {
      if (wpWeather && wpWeather.forecast) {
        const hasAdverseWeather = wpWeather.forecast.some(w =>
          (w.wind && w.wind.speed > 15) ||
          (w.weather && w.weather[0] &&
            (w.weather[0].main === 'Storm' ||
              w.weather[0].main === 'Rain' && w.weather[0].description.includes('heavy')))
        );

        if (hasAdverseWeather) {
          waypointsWithAdverseWeather.push(index);
        }
      }
    });

    let adjustedWaypoints = [...waypoints];

    for (const index of waypointsWithAdverseWeather) {
      if (index > 0 && index < waypoints.length - 1) {
        const prevWp = turf.point(waypoints[index - 1]);
        const currWp = turf.point(waypoints[index]);
        const nextWp = turf.point(waypoints[index + 1]);

        const bearing = turf.bearing(prevWp, currWp);

        const distance = turf.distance(prevWp, currWp, {
          units: 'kilometers'
        });

        const deviationAngle = 30;
        const newBearing = bearing + deviationAngle;

        const adjustedPoint = turf.destination(
          prevWp,
          distance,
          newBearing, {
            units: 'kilometers'
          }
        );

        adjustedWaypoints[index] = adjustedPoint.geometry.coordinates;
      }
    }

    let totalDistance = 0;
    for (let i = 0; i < adjustedWaypoints.length - 1; i++) {
      const pt1 = turf.point(adjustedWaypoints[i]);
      const pt2 = turf.point(adjustedWaypoints[i + 1]);
      totalDistance += turf.distance(pt1, pt2, {
        units: 'kilometers'
      });
    }

    const baseSpeed = 20;

    const duration = totalDistance / baseSpeed + (waypointsWithAdverseWeather.length * 0.5);

    return {
      waypoints: adjustedWaypoints,
      distance: totalDistance,
      duration: duration,
      averageSpeed: totalDistance / duration,
      startLocation,
      endLocation
    };
  }
  async generateFuelOptimizedRoute(startLocation, endLocation, cargoWeight, ship, fuelData) {
    const baseRoute = this.generateBaseRoute(startLocation, endLocation);
    let optimalSpeed = this.calculateOptimalSpeed(ship, cargoWeight, fuelData);
    optimalSpeed = Math.min(optimalSpeed, baseRoute.averageSpeed * 0.85);
    const duration = baseRoute.distance / optimalSpeed;

    return {
      waypoints: baseRoute.waypoints,
      distance: baseRoute.distance,
      duration: duration,
      averageSpeed: optimalSpeed,
      startLocation,
      endLocation
    };
  }

  async generateHistoricalLearningRoute(startLocation, endLocation, historicalRoutes, fuelData) {
    const baseRoute = this.generateBaseRoute(startLocation, endLocation);
    const similarRoutes = this.findSimilarHistoricalRoutes(
      startLocation,
      endLocation,
      historicalRoutes
    );
    if (similarRoutes.length === 0) {
      return baseRoute;
    }

    let mostEfficientRoute = similarRoutes[0];
    let bestEfficiency = 0;

    similarRoutes.forEach(route => {

      const fuelRecord = fuelData.find(f => f.routeId === route._id);

      if (fuelRecord && fuelRecord.fuelConsumed > 0) {
        const efficiency = route.distance / fuelRecord.fuelConsumed;

        if (efficiency > bestEfficiency) {
          bestEfficiency = efficiency;
          mostEfficientRoute = route;
        }
      }
    });

    const historicalSpeed = mostEfficientRoute.distance / mostEfficientRoute.timeTaken;

    const adjustedSpeed = (historicalSpeed + baseRoute.averageSpeed) / 2;

    const duration = baseRoute.distance / adjustedSpeed;

    return {
      waypoints: baseRoute.waypoints,
      distance: baseRoute.distance,
      duration: duration,
      averageSpeed: adjustedSpeed,
      startLocation,
      endLocation,
      historicalRouteId: mostEfficientRoute._id
    };
  }

  async generateHybridRoute(routeOptions, weatherData, cargoWeight, ship) {

    const weatherRoute = routeOptions.find(r => r.strategy === 'weather-optimized');
    const fuelRoute = routeOptions.find(r => r.strategy === 'fuel-optimized');
    const historicalRoute = routeOptions.find(r => r.strategy === 'historical-learning');

    if (!weatherRoute) return fuelRoute || routeOptions[0];
    if (!fuelRoute) return weatherRoute;

    let weatherFactor = 0.5;
    let fuelFactor = 0.5;
    let historicalFactor = 0;

    if (this.hasAdverseWeather(weatherData)) {
      weatherFactor = 0.7;
      fuelFactor = 0.3;
    }

    if (cargoWeight > 30000) {
      fuelFactor += 0.1;
      weatherFactor -= 0.1;
    }

    if (historicalRoute) {

      historicalFactor = 0.2;
      weatherFactor *= (1 - historicalFactor);
      fuelFactor *= (1 - historicalFactor);
    }

    const hybridSpeed =
      (weatherRoute.averageSpeed * weatherFactor) +
      (fuelRoute.averageSpeed * fuelFactor) +
      (historicalRoute ? historicalRoute.averageSpeed * historicalFactor : 0);

    const waypoints = weatherRoute.waypoints;

    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const pt1 = turf.point(waypoints[i]);
      const pt2 = turf.point(waypoints[i + 1]);
      totalDistance += turf.distance(pt1, pt2, {
        units: 'kilometers'
      });
    }

    const duration = totalDistance / hybridSpeed;

    return {
      waypoints,
      distance: totalDistance,
      duration,
      averageSpeed: hybridSpeed,
      startLocation: weatherRoute.startLocation,
      endLocation: weatherRoute.endLocation,
      hybridFactors: {
        weather: weatherFactor,
        fuel: fuelFactor,
        historical: historicalFactor
      }
    };
  }

  calculateOptimalSpeed(ship, cargoWeight, fuelData) {

    let optimalSpeed = 17.5;

    if (fuelData && fuelData.length > 0) {

      const speedEfficiency = {};

      fuelData.forEach(record => {
        if (record.speed && record.fuelConsumed && record.distance) {

          const speedRange = Math.round(record.speed / 2) * 2;

          if (!speedEfficiency[speedRange]) {
            speedEfficiency[speedRange] = {
              totalDistance: 0,
              totalFuel: 0
            };
          }

          speedEfficiency[speedRange].totalDistance += record.distance;
          speedEfficiency[speedRange].totalFuel += record.fuelConsumed;
        }
      });

      let bestEfficiency = 0;

      Object.entries(speedEfficiency).forEach(([speed, data]) => {
        if (data.totalFuel > 0) {
          const efficiency = data.totalDistance / data.totalFuel;

          if (efficiency > bestEfficiency) {
            bestEfficiency = efficiency;
            optimalSpeed = parseInt(speed);
          }
        }
      });
    }

    if (ship.type === 'tanker') {
      optimalSpeed *= 0.95;
    } else if (ship.type === 'container') {
      optimalSpeed *= 1.05;
    }

    const loadFactor = Math.min(1, cargoWeight / (ship.capacity || 30000));
    optimalSpeed *= (1 - (loadFactor * 0.1));

    return Math.max(12, Math.min(optimalSpeed, 22));
  }

  selectOptimalRoute(routeOptions, historicalRoutes, weatherData) {

    const routeScores = routeOptions.map(route => {
      return {
        route,
        score: 0
      };
    });

    const factors = {
      fuelEfficiency: 0.4,
      time: 0.2,
      weatherSafety: 0.3,
      historicalSuccess: 0.1
    };

    routeScores.forEach(routeScore => {
      const route = routeScore.route;

      if (route.predictedFuelConsumption) {

        const consumptions = routeOptions.map(r => r.predictedFuelConsumption);
        const minConsumption = Math.min(...consumptions.filter(c => c > 0));
        const maxConsumption = Math.max(...consumptions);

        const fuelScore = maxConsumption > minConsumption ?
          1 - ((route.predictedFuelConsumption - minConsumption) / (maxConsumption - minConsumption)) :
          0.5;

        routeScore.score += fuelScore * factors.fuelEfficiency;
      }

      const durations = routeOptions.map(r => r.duration);
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);

      const timeScore = maxDuration > minDuration ?
        1 - ((route.duration - minDuration) / (maxDuration - minDuration)) :
        0.5;

      routeScore.score += timeScore * factors.time;

      const weatherScore = this.calculateWeatherSafetyScore(route, weatherData);
      routeScore.score += weatherScore * factors.weatherSafety;

      const historicalScore = this.calculateHistoricalSuccessScore(route, historicalRoutes);
      routeScore.score += historicalScore * factors.historicalSuccess;
    });

    routeScores.sort((a, b) => b.score - a.score);

    return routeScores[0].route;
  }

  calculateWeatherSafetyScore(route, weatherData) {

    if (!weatherData || weatherData.length === 0) {
      return 0.5;
    }

    let adverseWaypointCount = 0;

    weatherData.forEach(wpWeather => {
      if (wpWeather && wpWeather.forecast) {
        const hasAdverseWeather = wpWeather.forecast.some(w =>
          (w.wind && w.wind.speed > 15) ||
          (w.weather && w.weather[0] &&
            (w.weather[0].main === 'Storm' ||
              w.weather[0].main === 'Rain' && w.weather[0].description.includes('heavy')))
        );

        if (hasAdverseWeather) {
          adverseWaypointCount++;
        }
      }
    });

    const safetyScore = 1 - (adverseWaypointCount / Math.max(1, weatherData.length));

    if (route.strategy === 'weather-optimized') {
      return Math.min(1, safetyScore * 1.2);
    }

    return safetyScore;
  }

  calculateHistoricalSuccessScore(route, historicalRoutes) {

    if (route.strategy === 'historical-learning' && route.historicalRouteId) {
      return 0.85;
    }

    if (!historicalRoutes || historicalRoutes.length === 0) {
      return 0.5;
    }

    const similarRoutes = this.findSimilarHistoricalRoutes(
      route.startLocation,
      route.endLocation,
      historicalRoutes
    );

    if (similarRoutes.length === 0) {
      return 0.5;
    }

    const avgHistoricalSpeed = similarRoutes.reduce((sum, r) =>
      sum + (r.distance / r.timeTaken), 0) / similarRoutes.length;

    const speedDifference = Math.abs(route.averageSpeed - avgHistoricalSpeed);
    const speedScore = Math.max(0, 1 - (speedDifference / avgHistoricalSpeed));

    return speedScore;
  }

  async calculateBaseFuelConsumption(route, ship, cargoWeight, weatherData) {

    let baseFuelRate = 0.08;

    const shipAgeYears = this.calculateShipAge(ship);
    const ageMultiplier = 1 + (Math.max(0, shipAgeYears - 5) * 0.01);

    let shipTypeMultiplier = 1.0;
    if (ship.type === 'tanker') shipTypeMultiplier = 1.2;
    if (ship.type === 'container') shipTypeMultiplier = 1.1;
    if (ship.type === 'bulk') shipTypeMultiplier = 0.9;

    const capacityUtilization = cargoWeight / (ship.capacity || 30000);
    const cargoMultiplier = 0.7 + (capacityUtilization * 0.6);

    const speedFactor = Math.pow(route.averageSpeed / 20, 1.5);

    const weatherMultiplier = this.calculateWeatherMultiplier(route.waypoints, weatherData);

    const totalConsumption = route.distance * baseFuelRate * shipTypeMultiplier *
      ageMultiplier * cargoMultiplier * speedFactor * weatherMultiplier;

    return totalConsumption;
  }

  calculateWeatherMultiplier(waypoints, weatherData) {

    if (!weatherData || weatherData.length === 0) {
      return 1.0;
    }

    let totalWeatherImpact = 0;
    let totalWaypoints = Math.min(waypoints.length, weatherData.length);

    for (let i = 0; i < totalWaypoints; i++) {
      const wpWeather = weatherData[i];

      if (wpWeather && wpWeather.forecast && wpWeather.forecast.length > 0) {

        const segmentWeather = {
          windSpeed: 0,
          precipitation: 0,
          temperature: 0
        };

        wpWeather.forecast.forEach(item => {
          segmentWeather.windSpeed += item.wind?.speed || 0;
          segmentWeather.precipitation += item.rain?.['3h'] || item.snow?.['3h'] || 0;
          segmentWeather.temperature += item.main?.temp || 15;
        });

        const forecastCount = wpWeather.forecast.length;
        segmentWeather.windSpeed /= forecastCount;
        segmentWeather.precipitation /= forecastCount;
        segmentWeather.temperature /= forecastCount;

        let waypointImpact = 1.0;

        if (segmentWeather.windSpeed > 10) {
          waypointImpact *= 1 + ((segmentWeather.windSpeed - 10) / 5 * 0.02);
        }

        if (segmentWeather.precipitation > 0) {
          waypointImpact *= 1 + (segmentWeather.precipitation * 0.01);
        }

        const tempDiff = Math.abs(segmentWeather.temperature - 15);
        if (tempDiff > 5) {
          waypointImpact *= 1 + (tempDiff / 5 * 0.005);
        }

        totalWeatherImpact += waypointImpact;
      } else {

        totalWeatherImpact += 1.0;
      }
    }

    return totalWaypoints > 0 ? totalWeatherImpact / totalWaypoints : 1.0;
  }

  calculateShipAge(ship) {
    if (!ship.buildDate) return 10;

    const buildDate = new Date(ship.buildDate);
    const now = new Date();

    return (now - buildDate) / (1000 * 60 * 60 * 24 * 365);
  }

  findSimilarHistoricalRoutes(startLocation, endLocation, historicalRoutes) {
    if (!historicalRoutes || historicalRoutes.length === 0) {
      return [];
    }

    const startPoint = turf.point([startLocation.lon, startLocation.lat]);
    const endPoint = turf.point([endLocation.lon, endLocation.lat]);

    const similarRoutes = historicalRoutes.filter(route => {

      if (!route.startLocation || !route.endLocation) return false;

      const routeStart = turf.point([
        route.startLocation.lon || 0,
        route.startLocation.lat || 0
      ]);

      const routeEnd = turf.point([
        route.endLocation.lon || 0,
        route.endLocation.lat || 0
      ]);

      const startDistance = turf.distance(startPoint, routeStart, {
        units: 'kilometers'
      });
      const endDistance = turf.distance(endPoint, routeEnd, {
        units: 'kilometers'
      });

      return startDistance < 500 && endDistance < 500;
    });

    return similarRoutes;
  }

  hasAdverseWeather(weatherData) {
    if (!weatherData || weatherData.length === 0) {
      return false;
    }

    return weatherData.some(wpWeather => {
      if (!wpWeather || !wpWeather.forecast) return false;

      return wpWeather.forecast.some(w =>
        (w.wind && w.wind.speed > 15) ||
        (w.weather && w.weather[0] &&
          (w.weather[0].main === 'Storm' ||
            w.weather[0].main === 'Rain' && w.weather[0].description.includes('heavy')))
      );
    });
  }

  async getWeatherForecast(waypoints, plannedStartDate) {
    try {

      if (!weatherService) {
        console.log('Weather service not available, using mock data');
        return this.generateMockWeatherData(waypoints, plannedStartDate);
      }

      const waypointCoords = waypoints.map(wp => ({
        lat: wp[1],
        lon: wp[0]
      }));

      const startPoint = turf.point([waypoints[0][0], waypoints[0][1]]);
      const endPoint = turf.point([waypoints[waypoints.length - 1][0], waypoints[waypoints.length - 1][1]]);
      const totalDistance = turf.distance(startPoint, endPoint, {
        units: 'kilometers'
      });

      const estimatedDuration = totalDistance / 20;

      const estimatedEndDate = new Date(plannedStartDate);
      estimatedEndDate.setHours(estimatedEndDate.getHours() + estimatedDuration);

      const forecasts = await Promise.all(
        waypointCoords.map(async (coord) => {
          try {
            return await weatherService.getForecast(coord.lat, coord.lon);
          } catch (error) {
            console.error(`Error getting forecast for waypoint ${coord.lat},${coord.lon}:`, error);
            return null;
          }
        })
      );

      return forecasts;
    } catch (error) {
      console.error('Error getting weather forecast:', error);
      return this.generateMockWeatherData(waypoints, plannedStartDate);
    }
  }

  generateMockWeatherData(waypoints, startDate) {
    return waypoints.map((wp, index) => {

      const conditions = ['Clear', 'Clouds', 'Rain', 'Storm'];
      const windSpeeds = [5, 10, 15, 20, 25];
      const temperatures = [5, 10, 15, 20, 25];

      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      const windSpeed = windSpeeds[Math.floor(Math.random() * windSpeeds.length)];
      const temp = temperatures[Math.floor(Math.random() * temperatures.length)];

      const forecast = [];
      const startTime = new Date(startDate);

      for (let i = 0; i < 40; i++) {
        const forecastTime = new Date(startTime);
        forecastTime.setHours(forecastTime.getHours() + (i * 3));

        forecast.push({
          dt: forecastTime.getTime() / 1000,
          main: {
            temp: temp + (Math.random() * 5 - 2.5),
            sea_level: 1013 + (Math.random() * 10 - 5)
          },
          wind: {
            speed: windSpeed + (Math.random() * 5 - 2.5)
          },
          weather: [{
            main: condition,
            description: `${condition.toLowerCase()}`
          }]
        });
      }

      return {
        location: {
          lat: wp[1],
          lon: wp[0]
        },
        forecast: forecast
      };
    });
  }

  async predictFuelConsumption(route, ship, cargoWeight, weatherData, fuelData, historicalRoutes) {
    try {

      const baseFuelConsumption = await this.calculateBaseFuelConsumption(
        route,
        ship,
        cargoWeight,
        weatherData
      );

      let adjustedFuelConsumption = baseFuelConsumption;
      let adjustmentFactor = 1.0;
      let confidenceLevel = 'medium';

      const similarRoutes = this.findSimilarHistoricalRoutes(
        route.startLocation,
        route.endLocation,
        historicalRoutes
      );

      if (similarRoutes.length > 0) {

        const predictions = [];

        similarRoutes.forEach(historicalRoute => {

          const fuelRecord = fuelData.find(f =>
            f.routeId === historicalRoute._id.toString()
          );

          if (fuelRecord && fuelRecord.fuelConsumed > 0) {

            const fuelRate = fuelRecord.fuelConsumed / historicalRoute.distance;

            const similarityScore = this.calculateRouteSimilarity(
              route,
              historicalRoute,
              ship,
              cargoWeight
            );

            predictions.push({
              fuelRate,
              similarityScore
            });
          }
        });

        if (predictions.length > 0) {
          let totalWeight = 0;
          let weightedSum = 0;

          predictions.forEach(pred => {
            weightedSum += pred.fuelRate * pred.similarityScore;
            totalWeight += pred.similarityScore;
          });

          const historicalFuelRate = totalWeight > 0 ?
            weightedSum / totalWeight :
            baseFuelConsumption / route.distance;

          const historicalPrediction = historicalFuelRate * route.distance;

          const historicalWeight = Math.min(0.7, 0.3 + (predictions.length * 0.1));

          adjustedFuelConsumption = (baseFuelConsumption * (1 - historicalWeight)) +
            (historicalPrediction * historicalWeight);

          adjustmentFactor = adjustedFuelConsumption / baseFuelConsumption;

          if (predictions.length >= 5) {
            confidenceLevel = 'high';
          } else if (predictions.length >= 2) {
            confidenceLevel = 'medium';
          } else {
            confidenceLevel = 'low';
          }
        }
      }

      const segmentConsumption = [];
      const waypoints = route.waypoints;

      for (let i = 0; i < waypoints.length - 1; i++) {
        const pt1 = turf.point(waypoints[i]);
        const pt2 = turf.point(waypoints[i + 1]);
        const segmentDist = turf.distance(pt1, pt2, {
          units: 'kilometers'
        });

        const segmentWeatherMultiplier = weatherData && weatherData[i] ?
          this.calculateWeatherMultiplier([waypoints[i]], [weatherData[i]]) : 1.0;

        const segmentBaseFuelRate = baseFuelConsumption / route.distance;

        const segmentFuelRate = segmentBaseFuelRate * segmentWeatherMultiplier * adjustmentFactor;

        const segmentFuel = segmentDist * segmentFuelRate;

        segmentConsumption.push({
          from: i,
          to: i + 1,
          distance: segmentDist,
          consumption: segmentFuel
        });
      }

      return {
        ...route,
        fuelConsumption: {
          total: adjustedFuelConsumption,
          bySegment: segmentConsumption,
          averagePerHour: adjustedFuelConsumption / route.duration,
          averagePerMile: adjustedFuelConsumption / route.distance,
          weatherImpact: this.getWeatherImpactDetails(route, weatherData),
          confidenceLevel,
          mlAdjustmentFactor: adjustmentFactor
        }
      };
    } catch (error) {
      console.error('Error predicting fuel consumption:', error);

      return {
        ...route,
        fuelConsumption: {
          total: route.distance * 0.08,
          bySegment: [],
          averagePerHour: (route.distance * 0.08) / route.duration,
          averagePerMile: 0.08,
          weatherImpact: {
            multiplier: 1.0,
            details: []
          },
          confidenceLevel: 'low'
        }
      };
    }
  }

  calculateRouteSimilarity(currentRoute, historicalRoute, ship, cargoWeight) {

    const distanceRatio = Math.min(
      currentRoute.distance / historicalRoute.distance,
      historicalRoute.distance / currentRoute.distance
    );

    const currentSpeed = currentRoute.averageSpeed;
    const historicalSpeed = historicalRoute.distance / historicalRoute.timeTaken;

    const speedRatio = Math.min(
      currentSpeed / historicalSpeed,
      historicalSpeed / currentSpeed
    );

    let cargoRatio = 1.0;
    if (historicalRoute.cargoWeight) {
      cargoRatio = Math.min(
        cargoWeight / historicalRoute.cargoWeight,
        historicalRoute.cargoWeight / cargoWeight
      );
    }

    return (distanceRatio * 0.4) + (speedRatio * 0.4) + (cargoRatio * 0.2);
  }

  getWeatherImpactDetails(route, weatherData) {
    if (!weatherData || weatherData.length === 0) {
      return {
        multiplier: 1.0,
        details: []
      };
    }

    const multiplier = this.calculateWeatherMultiplier(route.waypoints, weatherData);

    const details = [];

    weatherData.forEach((wpWeather, index) => {
      if (!wpWeather || !wpWeather.forecast || wpWeather.forecast.length === 0) {
        return;
      }

      const avgWindSpeed = wpWeather.forecast.reduce((sum, f) => sum + (f.wind?.speed || 0), 0) / wpWeather.forecast.length;
      const avgPrecipitation = wpWeather.forecast.reduce((sum, f) => sum + (f.rain?.['3h'] || f.snow?.['3h'] || 0), 0) / wpWeather.forecast.length;
      const avgTemp = wpWeather.forecast.reduce((sum, f) => sum + (f.main?.temp || 15), 0) / wpWeather.forecast.length;

      if (avgWindSpeed > 15) {
        details.push({
          segment: index,
          factor: 'wind',
          value: avgWindSpeed,
          impact: `${((avgWindSpeed - 10) / 5 * 2).toFixed(1)}%`
        });
      }

      if (avgPrecipitation > 1) {
        details.push({
          segment: index,
          factor: 'precipitation',
          value: avgPrecipitation,
          impact: `${(avgPrecipitation * 1).toFixed(1)}%`
        });
      }

      const tempDiff = Math.abs(avgTemp - 15);
      if (tempDiff > 10) {
        details.push({
          segment: index,
          factor: 'temperature',
          value: avgTemp,
          impact: `${(tempDiff / 5 * 0.5).toFixed(1)}%`
        });
      }
    });

    return {
      multiplier,
      details
    };
  }
}

module.exports = new AIOptimizationService();