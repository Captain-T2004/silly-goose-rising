const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');

module.exports = class ShipModel {
  static async getCollection() {
    const db = await connectDB();
    return db.collection('ships');
  }

  static async findAll() {
    const collection = await this.getCollection();
    return collection.find({}).toArray();
  }

  static async findById(shipId) {
    const collection = await this.getCollection();
    return collection.findOne({ shipId });
  }

  static async create(shipData) {
    const collection = await this.getCollection();
    shipData.lastUpdated = new Date();
    const result = await collection.insertOne(shipData);
    return result;
  }

  static async update(shipId, updateData) {
    const collection = await this.getCollection();
    updateData.lastUpdated = new Date();
    return collection.updateOne(
      { shipId },
      { $set: updateData }
    );
  }
}