const turf = require('@turf/turf');
const weatherService = require('./weatherService');

class RouteOptimizationService {
  async optimizeRoute(startLocation, endLocation, cargoWeight, plannedStartDate, estimatedDays = null) {
    try {
      const startPoint = turf.point([startLocation.lon, startLocation.lat]);
      const endPoint = turf.point([endLocation.lon, endLocation.lat]);

      const directDistance = turf.distance(startPoint, endPoint, {
        units: 'kilometers'
      });

      const baseRoute = this.generateBaseRoute(startPoint, endPoint);

      const avgSpeed = this.calculateBaseSpeed(cargoWeight, directDistance);
      let estimatedTime = directDistance / avgSpeed;

      if (estimatedDays) {
        estimatedTime = estimatedDays * 24;
      }

      const estimatedEndDate = new Date(plannedStartDate);
      estimatedEndDate.setHours(estimatedEndDate.getHours() + estimatedTime);

      const routeWeather = await weatherService.getRouteWeather(
        baseRoute.waypoints.map(wp => ({
          lat: wp[1],
          lon: wp[0]
        })),
        plannedStartDate,
        estimatedEndDate
      );

      const optimizedRoute = this.applyWeatherOptimization(baseRoute, routeWeather, cargoWeight);

      const fuelConsumption = this.calculateFuelConsumption(
        optimizedRoute.distance,
        optimizedRoute.averageSpeed,
        cargoWeight
      );

      const criticalConditions = await weatherService.getCriticalConditions(
        optimizedRoute.waypoints.map(wp => ({
          lat: wp[1],
          lon: wp[0]
        })),
        plannedStartDate,
        estimatedEndDate
      );

      return {
        startLocation,
        endLocation,
        plannedStartDate,
        estimatedEndDate,
        distance: optimizedRoute.distance,
        duration: optimizedRoute.duration,
        averageSpeed: optimizedRoute.averageSpeed,
        waypoints: optimizedRoute.waypoints,
        fuelConsumption,
        weatherConditions: routeWeather,
        criticalConditions,
        routeType: optimizedRoute.routeType
      };
    } catch (error) {
      console.error('Error optimizing route:', error);
      throw new Error('Failed to optimize route');
    }
  }

  generateBaseRoute(startPoint, endPoint) {
    const directLine = turf.lineString([startPoint.geometry.coordinates, endPoint.geometry.coordinates]);

    const totalDistance = turf.length(directLine, {
      units: 'kilometers'
    });
    const numWaypoints = Math.max(5, Math.ceil(totalDistance / 200));

    const waypoints = [startPoint.geometry.coordinates];

    for (let i = 1; i < numWaypoints; i++) {
      const point = turf.along(directLine, (totalDistance * i) / numWaypoints, {
        units: 'kilometers'
      });
      waypoints.push(point.geometry.coordinates);
    }

    waypoints.push(endPoint.geometry.coordinates);

    return {
      waypoints,
      distance: totalDistance,
      duration: totalDistance / 20,
      averageSpeed: 20,
      routeType: 'direct'
    };
  }

  applyWeatherOptimization(baseRoute, weatherData, cargoWeight) {
    const waypoints = [...baseRoute.waypoints];

    let totalTimeAdjustment = 0;
    let adjustedWaypoints = [];

    for (let i = 0; i < waypoints.length; i++) {
      const wpWeather = weatherData[i]?.forecast || [];

      const hasAdverseWeather = wpWeather.some(w =>
        w.wind.speed > 15 ||
        w.weather[0].main === 'Storm' ||
        w.weather[0].main === 'Rain' && w.weather[0].description.includes('heavy')
      );

      if (hasAdverseWeather) {
        if (i > 0 && i < waypoints.length - 1) {
          const prevWp = turf.point(waypoints[i - 1]);
          const currWp = turf.point(waypoints[i]);
          const angle = Math.random() > 0.5 ? 20 : -20;

          const bearing = turf.bearing(prevWp, currWp);
          const distance = turf.distance(prevWp, currWp, {
            units: 'kilometers'
          });

          const newBearing = bearing + angle;
          const adjustedPoint = turf.destination(prevWp, distance, newBearing, {
            units: 'kilometers'
          });

          waypoints[i] = adjustedPoint.geometry.coordinates;

          totalTimeAdjustment += 0.5;
        }
      }

      adjustedWaypoints.push(waypoints[i]);
    }

    let totalDistance = 0;
    for (let i = 0; i < adjustedWaypoints.length - 1; i++) {
      const pt1 = turf.point(adjustedWaypoints[i]);
      const pt2 = turf.point(adjustedWaypoints[i + 1]);
      totalDistance += turf.distance(pt1, pt2, {
        units: 'kilometers'
      });
    }

    const baseSpeed = this.calculateBaseSpeed(cargoWeight, totalDistance);

    let adjustedSpeed = baseSpeed;
    weatherData.forEach(wp => {
      const wpWeather = wp.forecast || [];
      wpWeather.forEach(w => {
        if (w.wind.speed > 10) {
          adjustedSpeed -= 0.5 * (w.wind.speed - 10) / 5;
        }

        if (w.weather[0].main === 'Rain' || w.weather[0].main === 'Snow') {
          adjustedSpeed -= 1;
        }
      });
    });

    adjustedSpeed = Math.max(adjustedSpeed, 8);

    const adjustedDuration = totalDistance / adjustedSpeed + totalTimeAdjustment;

    return {
      waypoints: adjustedWaypoints,
      distance: totalDistance,
      duration: adjustedDuration,
      averageSpeed: adjustedSpeed,
      routeType: 'weather-optimized'
    };
  }

  calculateBaseSpeed(cargoWeight, distance) {
    const baseSpeed = 22;

    const weightFactor = Math.max(0.85, 1 - (cargoWeight / 50000) * 0.15);

    const distanceFactor = distance > 5000 ? 0.95 : 1;

    return baseSpeed * weightFactor * distanceFactor;
  }

  calculateFuelConsumption(distance, speed, cargoWeight) {
    const baseFuelRate = 0.08;

    const speedFactor = Math.pow(speed / 20, 1.5);

    const weightFactor = 1 + (cargoWeight / 30000) * 0.5;

    return distance * baseFuelRate * speedFactor * weightFactor;
  }

  async generateAlternativeRoutes(startLocation, endLocation, cargoWeight, startDate) {
    try {
      const fastRoute = await this.optimizeRoute(startLocation, endLocation, cargoWeight, startDate);
      fastRoute.routeType = 'fastest';

      const fuelEfficientRoute = await this.optimizeRoute(startLocation, endLocation, cargoWeight, startDate);
      fuelEfficientRoute.averageSpeed *= 0.85;
      fuelEfficientRoute.duration = fuelEfficientRoute.distance / fuelEfficientRoute.averageSpeed;
      fuelEfficientRoute.fuelConsumption = this.calculateFuelConsumption(
        fuelEfficientRoute.distance,
        fuelEfficientRoute.averageSpeed,
        cargoWeight
      );
      fuelEfficientRoute.routeType = 'fuel-efficient';

      const weatherRoute = await this.optimizeRoute(startLocation, endLocation, cargoWeight, startDate);
      if (weatherRoute.criticalConditions.length > 0) {
        const startPoint = turf.point([startLocation.lon, startLocation.lat]);
        const endPoint = turf.point([endLocation.lon, endLocation.lat]);
        const totalDistance = turf.distance(startPoint, endPoint, {
          units: 'kilometers'
        });
        const numWaypoints = Math.max(10, Math.ceil(totalDistance / 100));
        const moreWaypoints = this.generateBaseRoute(startPoint, endPoint, numWaypoints);
        weatherRoute.waypoints = moreWaypoints.waypoints;
        weatherRoute.distance *= 1.15;
        weatherRoute.duration *= 1.2;
      }
      weatherRoute.routeType = 'weather-optimized';

      return [fastRoute, fuelEfficientRoute, weatherRoute];
    } catch (error) {
      console.error('Error generating alternative routes:', error);
      throw new Error('Failed to generate alternative routes');
    }
  }

  async updateRouteRealTime(currentRoute, currentPosition, currentTime) {
    try {
      const currentPosPoint = turf.point([currentPosition.lon, currentPosition.lat]);
      const waypointPoints = currentRoute.waypoints.map(wp => turf.point(wp));
      let minDistance = Infinity;
      let nearestWaypointIndex = 0;

      waypointPoints.forEach((wp, index) => {
        const distance = turf.distance(currentPosPoint, wp, {
          units: 'kilometers'
        });
        if (distance < minDistance) {
          minDistance = distance;
          nearestWaypointIndex = index;
        }
      });
      const remainingWaypoints = currentRoute.waypoints.slice(nearestWaypointIndex);
      console.log(remainingWaypoints);
      const endLocation = {
        lat: currentRoute.waypoints[currentRoute.waypoints.length - 1][1],
        lon: currentRoute.waypoints[currentRoute.waypoints.length - 1][0]
      };

      const updatedRoute = await this.optimizeRoute(
        currentPosition,
        endLocation,
        currentRoute.cargoWeight,
        currentTime
      );

      return {
        ...updatedRoute,
        originalRoute: currentRoute,
        updatedAt: new Date(),
        reason: 'Real-time weather update'
      };
    } catch (error) {
      console.error('Error updating route in real-time:', error);
      throw new Error('Failed to update route');
    }
  }
}

module.exports = new RouteOptimizationService();