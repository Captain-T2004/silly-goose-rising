const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

module.exports = class FuelUsageModel {
  static async getCollection() {
    const db = await connectDB();
    return db.collection('fuelUsage');
  }

  static async findByShipId(shipId) {
    const collection = await this.getCollection();
    return collection.find({ shipId }).toArray();
  }

  static async findByRouteId(routeId) {
    const collection = await this.getCollection();
    return collection.find({ routeId: new ObjectId(routeId) }).toArray();
  }

  static async create(fuelData) {
    if (typeof fuelData.routeId === 'string') {
      fuelData.routeId = new ObjectId(fuelData.routeId);
    }
    const collection = await this.getCollection();
    const result = await collection.insertOne(fuelData);
    return result;
  }
}