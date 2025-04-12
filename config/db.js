const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const uri = process.env.MONGODB_CONNECTION_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;

async function connectDB() {
  if (db) return db;

  try {
    await client.connect();
    db = client.db("fleetManagement");

    await initializeCollections(db);

    console.log("MongoDB connection established successfully");
    return db;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

async function initializeCollections(db) {
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);
  if (!collectionNames.includes('users')) {
      await db.createCollection('users', {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["name", "email", "password", "role"],
            properties: {
              name: {
                bsonType: "string",
                description: "User's name - required"
              },
              email: {
                bsonType: "string",
                description: "User's email - required"
              },
              password: {
                bsonType: "string",
                description: "User's hashed password - required"
              },
              role: {
                bsonType: "string",
                description: "User's role - required",
                enum: ["user", "manager", "admin"]
              },
              createdAt: {
                bsonType: "date",
                description: "Account creation timestamp"
              }
            }
          }
        }
      });
      console.log("Users collection created");
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
  }

  if (!collectionNames.includes('ships')) {
    await db.createCollection('ships', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["shipId", "capacity", "fuelType", "engineHours"],
          properties: {
            shipId: {
              bsonType: "string",
              description: "Ship identifier - required"
            },
            capacity: {
              bsonType: "number",
              description: "Ship capacity in tonnage - required"
            },
            fuelType: {
              bsonType: "string",
              description: "Type of fuel used - required"
            },
            engineHours: {
              bsonType: "number",
              description: "Total engine hours - required"
            },
            lastUpdated: {
              bsonType: "date",
              description: "Last update timestamp"
            }
          }
        }
      }
    });
    console.log("Ships collection created");
    await db.collection('ships').createIndex({ shipId: 1 }, { unique: true });
  }

  if (!collectionNames.includes('routeHistory')) {
    await db.createCollection('routeHistory', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["shipId", "startLocation", "endLocation", "startDate", "endDate", "distance"],
          properties: {
            shipId: {
              bsonType: "string",
              description: "Ship identifier - required"
            },
            startLocation: {
              bsonType: "string",
              description: "Starting port or location - required"
            },
            endLocation: {
              bsonType: "string",
              description: "Ending port or location - required"
            },
            startDate: {
              bsonType: "date",
              description: "Journey start date - required"
            },
            endDate: {
              bsonType: "date",
              description: "Journey end date - required"
            },
            distance: {
              bsonType: "number",
              description: "Distance traveled in nautical miles - required"
            },
            timeTaken: {
              bsonType: "number",
              description: "Time taken in hours"
            },
            weather: {
              bsonType: "object",
              description: "Weather conditions during journey"
            }
          }
        }
      }
    });
    console.log("Route History collection created");
    await db.collection('routeHistory').createIndex({ shipId: 1 });
    await db.collection('routeHistory').createIndex({ startDate: 1 });
  }

  if (!collectionNames.includes('fuelUsage')) {
    await db.createCollection('fuelUsage', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["shipId", "routeId", "fuelConsumed", "date"],
          properties: {
            shipId: {
              bsonType: "string",
              description: "Ship identifier - required"
            },
            routeId: {
              bsonType: "objectId",
              description: "Reference to route history - required"
            },
            fuelConsumed: {
              bsonType: "number",
              description: "Amount of fuel consumed in liters/gallons - required"
            },
            date: {
              bsonType: "date",
              description: "Date of recording - required"
            },
            fuelEfficiency: {
              bsonType: "number",
              description: "Calculated fuel efficiency (distance/fuel)"
            },
            cost: {
              bsonType: "number",
              description: "Cost of fuel"
            }
          }
        }
      }
    });
    console.log("Fuel Usage collection created");
    await db.collection('fuelUsage').createIndex({ shipId: 1 });
    await db.collection('fuelUsage').createIndex({ routeId: 1 });
  }

  if (!collectionNames.includes('maintenanceLogs')) {
    await db.createCollection('maintenanceLogs', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["shipId", "maintenanceDate", "maintenanceType", "engineHoursAtMaintenance"],
          properties: {
            shipId: {
              bsonType: "string",
              description: "Ship identifier - required"
            },
            maintenanceDate: {
              bsonType: "date",
              description: "Date of maintenance - required"
            },
            maintenanceType: {
              bsonType: "string",
              description: "Type of maintenance performed - required",
              enum: ["routine", "repair", "overhaul", "emergency", "inspection"]
            },
            engineHoursAtMaintenance: {
              bsonType: "number",
              description: "Engine hours at time of maintenance - required"
            },
            issuesFound: {
              bsonType: "array",
              description: "List of issues discovered during maintenance",
              items: {
                bsonType: "object",
                required: ["description", "severity"],
                properties: {
                  description: {
                    bsonType: "string",
                    description: "Description of the issue"
                  },
                  severity: {
                    bsonType: "string",
                    enum: ["low", "medium", "high", "critical"],
                    description: "Severity of the issue"
                  },
                  resolved: {
                    bsonType: "bool",
                    description: "Whether the issue was resolved"
                  }
                }
              }
            },
            maintenanceCost: {
              bsonType: "number",
              description: "Cost of maintenance"
            },
            technician: {
              bsonType: "string",
              description: "Name of technician who performed maintenance"
            },
            notes: {
              bsonType: "string",
              description: "Additional notes"
            }
          }
        }
      }
    });
    console.log("Maintenance Logs collection created");
    await db.collection('maintenanceLogs').createIndex({ shipId: 1 });
    await db.collection('maintenanceLogs').createIndex({ maintenanceDate: 1 });
  }
}

module.exports = { connectDB };