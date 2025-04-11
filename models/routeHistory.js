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

  static async completeRoute(routeId, actualEndDate, actualDistance, actualDuration) {
    const collection = await this.getCollection();
    return collection.updateOne(
      { _id: new ObjectId(routeId) },
      {
        $set: {
          status: 'completed',
          endDate: new Date(actualEndDate),
          distance: actualDistance,
          timeTaken: actualDuration
        }
      }
    );
  }
}