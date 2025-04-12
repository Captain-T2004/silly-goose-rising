const { connectDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

class UserModel {
  static async getCollection() {
    const db = await connectDB();
    return db.collection('users');
  }

  static async findByEmail(email) {
    const collection = await this.getCollection();
    return collection.findOne({ email });
  }

  static async findById(id) {
    const collection = await this.getCollection();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  static async create(userData) {
    const collection = await this.getCollection();

    const salt = await bcrypt.genSalt(10);
    userData.password = await bcrypt.hash(userData.password, salt);

    userData.createdAt = new Date();
    
    const result = await collection.insertOne(userData);
    return result;
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async saveResetToken(userId, resetToken, resetExpires) {
    const collection = await this.getCollection();
    return collection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { resetToken, resetExpires } }
    );
  }

  static async findByResetToken(resetToken) {
    const collection = await this.getCollection();
    return collection.findOne({
      resetToken,
      resetExpires: { $gt: new Date() }
    });
  }

  static async updatePassword(userId, newPassword) {
    const collection = await this.getCollection();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    return collection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: { password: hashedPassword },
        $unset: { resetToken: "", resetExpires: "" }
      }
    );
  }

  static async saveRefreshToken(userId, refreshToken) {
    const collection = await this.getCollection();
    return collection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { refreshToken } }
    );
  }

  static async findByRefreshToken(refreshToken) {
    const collection = await this.getCollection();
    return collection.findOne({ refreshToken });
  }

  static async removeRefreshToken(userId) {
    const collection = await this.getCollection();
    return collection.updateOne(
      { _id: new ObjectId(userId) },
      { $unset: { refreshToken: "" } }
    );
  }

}

module.exports = UserModel;
