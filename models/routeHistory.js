const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

module.exports = class RouteHistoryModel {
  static async getCollection() {
    const db = await connectDB();
    return db.collection('routeHistory');
  }

  static async findByShipId(shipId) {
    const collection = await this.getCollection();
    return collection.find({ shipId }).toArray();
  }

  static async findById(routeId) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(routeId) });
  }

  static async findAllByQuery(query) {
    try {
      const collection = await this.getCollection();
      return collection.find(query).toArray();
    } catch (error) {
      console.error('Error in findAllByQuery:', error);
      return [];
    }
  }

  static async findByQuery(query) {
    try {
      const collection = await this.getCollection();
      return collection.find(query).toArray();
    } catch (error) {
      console.error('Error in findByQuery:', error);
      return [];
    }
  }

  static async create(routeData) {
    const collection = await this.getCollection();
    const result = await collection.insertOne(routeData);
    return result;
  }

  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).toArray();
  }

  static async findPlannedRoutes() {
    const collection = await this.getCollection();
    return collection.find({ status: 'planned' }).toArray();
  }

  static async updateRouteStatus(routeId, status) {
    const collection = await this.getCollection();
    return collection.updateOne(
      { _id: new ObjectId(routeId) },
      { $set: { status } }
    );
  }

  static async findByIdAndTransform(routeId) {
    const route = await this.findById(routeId);
    if (!route) return null;
    return this.transformRouteForApp(route);
  }

  static transformRouteForApp(route) {
    let startLocationObj = route.startLocation;
    let endLocationObj = route.endLocation;

    if (typeof route.startLocation === 'string') {
      const match = route.startLocation.match(/\(([^,]+),\s*([^)]+)\)/);
      if (match) {
        startLocationObj = {
          lat: parseFloat(match[1]),
          lon: parseFloat(match[2]),
          port: route.startLocation.split(' (')[0]
        };
      }
    }

    if (typeof route.endLocation === 'string') {
      const match = route.endLocation.match(/\(([^,]+),\s*([^)]+)\)/);
      if (match) {
        endLocationObj = {
          lat: parseFloat(match[1]),
          lon: parseFloat(match[2]),
          port: route.endLocation.split(' (')[0]
        };
      }
    }

    return {
      ...route,
      startLocation: startLocationObj,
      endLocation: endLocationObj,
      plannedStartDate: route.startDate,
      estimatedEndDate: route.endDate,
      estimatedDistance: route.distance,
      estimatedDuration: route.timeTaken,
      weatherConditions: route.weather?.weatherConditions || [],
      criticalConditions: route.weather?.criticalConditions || []
    };
  }

  static async updateRoute(routeId, updateData) {
    const collection = await this.getCollection();
    return collection.updateOne(
      { _id: new ObjectId(routeId) },
      { $set: updateData }
    );
  }

  static async completeRoute(routeId, actualEndDate, actualDistance, actualDuration, fuelConsumed) {
    const collection = await this.getCollection();
    return collection.updateOne(
      { _id: new ObjectId(routeId) },
      {
        $set: {
          status: 'completed',
          endDate: new Date(actualEndDate),
          distance: actualDistance,
          timeTaken: actualDuration,
          actualFuelConsumed: fuelConsumed
        }
      }
    );
  }

  static async findByShipIdAndTransform(shipId) {
    const routes = await this.findByShipId(shipId);
    return routes.map(route => this.transformRouteForApp(route));
  }

  static async findActiveRoutes() {
    const collection = await this.getCollection();
    return collection.find({
      status: { $in: ['planned', 'in-progress'] },
      plannedStartDate: { $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) } // Routes starting in the next 24 hours
    }).toArray();
  }

  static async findRoutesInProgress() {
    const collection = await this.getCollection();
    return collection.find({ status: 'in-progress' }).toArray();
  }

  static async updateWeatherData(routeId, weatherData) {
    const collection = await this.getCollection();
    return collection.updateOne(
      { _id: new ObjectId(routeId) },
      {
        $set: {
          weatherConditions: weatherData,
          lastWeatherUpdate: new Date()
        }
      }
    );
  }

  static async findRecentRoutes(limit = 10) {
    const collection = await this.getCollection();
    return collection.find({})
      .sort({ plannedStartDate: -1 })
      .limit(limit)
      .toArray();
  }

  static async findOptimalRoutes() {
    const collection = await this.getCollection();
    return collection.find({
      status: 'completed',
      actualFuelConsumed: { $exists: true }
    })
    .sort({ actualFuelConsumed: 1 })
    .limit(5)
    .toArray();
  }
}