const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

module.exports = class MaintenanceLogModel {
  static async getCollection() {
    const db = await connectDB();
    return db.collection('maintenanceLogs');
  }

  static async findByShipId(shipId) {
    const collection = await this.getCollection();
    return collection.find({ shipId }).toArray();
  }

  static async findById(logId) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(logId) });
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

  static async create(maintenanceData) {
    const collection = await this.getCollection();
    maintenanceData.createdAt = new Date();
    const result = await collection.insertOne(maintenanceData);
    return result;
  }

  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).toArray();
  }

  static async update(logId, updateData) {
    const collection = await this.getCollection();
    updateData.updatedAt = new Date();
    return collection.updateOne(
      { _id: new ObjectId(logId) },
      { $set: updateData }
    );
  }

  static async findRecentMaintenance(shipId = null, limit = 10) {
    const collection = await this.getCollection();
    const query = shipId ? { shipId } : {};

    return collection.find(query)
      .sort({ date: -1 })
      .limit(limit)
      .toArray();
  }

  static async findMaintenanceByType(shipId, maintenanceType) {
    const collection = await this.getCollection();
    return collection.find({
      shipId,
      maintenanceType
    }).sort({ date: -1 }).toArray();
  }

  static async getLastMaintenanceByType(shipId, maintenanceType) {
    const collection = await this.getCollection();
    return collection.find({
      shipId,
      maintenanceType
    }).sort({ date: -1 }).limit(1).toArray();
  }

  static async getMaintenanceStats(shipId = null) {
    const collection = await this.getCollection();
    const match = shipId ? { shipId } : {};

    const result = await collection.aggregate([
      { $match: match },
      { $group: {
          _id: '$maintenanceType',
          count: { $sum: 1 },
          averageDuration: { $avg: '$duration' },
          lastDate: { $max: '$date' }
        }
      }
    ]).toArray();

    return result;
  }
}