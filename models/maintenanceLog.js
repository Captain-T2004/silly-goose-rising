const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

module.exports = class MaintenanceLogModel {
  static async getCollection() {
    const db = await connectDB();
    return db.collection('maintenanceLogs');
  }

  static async findByShipId(shipId) {
    const collection = await this.getCollection();
    return collection.find({ shipId }).sort({ maintenanceDate: -1 }).toArray();
  }

  static async create(maintenanceData) {
    const collection = await this.getCollection();
    const result = await collection.insertOne(maintenanceData);
    return result;
  }

  static async findUpcomingMaintenance(daysAhead = 30) {
    const collection = await this.getCollection();
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);
    
    const ships = await (await connectDB()).collection('ships').find({}).toArray();

    return ships.map(ship => {
      return {
        shipId: ship.shipId,
        nextMaintenanceDate: new Date(Date.now() + Math.random() * daysAhead * 24 * 60 * 60 * 1000),
        maintenanceType: "routine",
        engineHoursAtMaintenance: ship.engineHours + 100
      };
    });
  }
}