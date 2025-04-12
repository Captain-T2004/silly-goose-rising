const socketIo = require('socket.io');
const routeOptimizationService = require('./routeOptimizationService');
const {
  RouteHistoryModel
} = require('../models');
const jwt = require('jsonwebtoken');

class WebSocketService {
  constructor() {
    this.io = null;
    this.activeRoutes = new Map();
  }

  initialize(server) {
    this.io = socketIo(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    this.io.use(async (socket, next) => {
      try {
        console.log('Socket attempting to connect:', socket.id);

        const token = socket.handshake.auth.token ||
          socket.handshake.query.token ||
          socket.handshake.headers.authorization?.split(' ')[1];

        if (!token) {
          console.log('No token provided for socket:', socket.id);
          socket.user = {
            _id: 'anonymous',
            role: 'guest'
          };
          return next();
        }

        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.user = decoded;
          console.log(decoded);
          console.log('Socket authenticated:', socket.id, decoded.id);
          next();
        } catch (err) {
          console.error('Invalid token for socket:', socket.id, err.message);
          socket.user = {
            _id: 'anonymous',
            role: 'guest'
          };
          next();
        }
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', this.handleConnection.bind(this));
    console.log('WebSocket server initialized');
  }

  handleConnection(socket) {
    console.log(`New client connected: ${socket.id}`);
    console.log(socket.user);
    socket.emit('welcome', {
      message: 'Connected to Ship Route Optimization WebSocket Server',
      socketId: socket.id,
      user: socket.user?.id || 'anonymous'
    });

    socket.on('join-route', this.handleJoinRoute.bind(this, socket));

    socket.on('request-route-plan', this.handleRoutePlanRequest.bind(this, socket));

    socket.on('update-position', this.handlePositionUpdate.bind(this, socket));

    socket.on('request-alternatives', this.handleAlternativesRequest.bind(this, socket));

    socket.on('select-route', this.handleRouteSelection.bind(this, socket));

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      this.cleanupSession(socket);
    });

    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  }

  async handleJoinRoute(socket, data) {
    try {
      console.log(`Join route request from ${socket.id}:`, data);
      const {
        routeId
      } = data;

      if (!routeId) {
        return socket.emit('error', {
          message: 'Route ID is required'
        });
      }

      socket.join(`route_${routeId}`);

      try {
        const route = await RouteHistoryModel.findById(routeId);

        if (!route) {
          socket.emit('error', {
            message: 'Route not found'
          });
          return;
        }

        this.activeRoutes.set(socket.id, {
          routeId,
          userId: socket.user?._id || 'anonymous',
          lastUpdate: new Date()
        });

        socket.emit('joined-route', {
          routeId,
          message: 'Successfully joined route planning session'
        });

        console.log(`Client ${socket.id} joined route planning for route ${routeId}`);
      } catch (error) {
        console.error('Error finding route:', error);
        socket.emit('error', {
          message: 'Error finding route'
        });
      }
    } catch (error) {
      console.error('Error joining route:', error);
      socket.emit('error', {
        message: 'Failed to join route planning session'
      });
    }
  }

  async handleRoutePlanRequest(socket, data) {
    try {
      console.log(`Route plan request from ${socket.id}:`, data);

      const {
        shipId,
        startLocation,
        endLocation,
        cargoWeight,
        plannedStartDate,
        estimatedDays
      } = data;

      if (!shipId || !startLocation || !endLocation || !cargoWeight || !plannedStartDate) {
        return socket.emit('error', {
          message: 'Missing required fields for route planning'
        });
      }

      const startDate = new Date(plannedStartDate);

      try {
        const routePlan = await routeOptimizationService.optimizeRoute(
          startLocation,
          endLocation,
          cargoWeight,
          startDate,
          estimatedDays
        );

        const routeData = {
          shipId,
          startLocation: typeof startLocation === 'object' ?
            `${startLocation.port || ''} (${startLocation.lat}, ${startLocation.lon})` : startLocation,
          endLocation: typeof endLocation === 'object' ?
            `${endLocation.port || ''} (${endLocation.lat}, ${endLocation.lon})` : endLocation,
          startDate: startDate,
          endDate: routePlan.estimatedEndDate,
          distance: routePlan.distance,
          timeTaken: routePlan.duration,
          weather: {
            weatherConditions: routePlan.weatherConditions,
            criticalConditions: routePlan.criticalConditions
          },
          cargoWeight,
          estimatedFuelConsumption: routePlan.fuelConsumption,
          waypoints: routePlan.waypoints,
          averageSpeed: routePlan.averageSpeed,
          routeType: routePlan.routeType,
          status: 'planned'
        };

        const result = await RouteHistoryModel.create(routeData);
        const routeId = result.insertedId.toString();

        this.activeRoutes.set(socket.id, {
          routeId,
          userId: socket.user?._id || 'anonymous',
          lastUpdate: new Date()
        });

        socket.join(`route_${routeId}`);

        socket.emit('route-plan', {
          routeId,
          ...routePlan
        });

        console.log(`Route plan created for ${socket.id}, route ID: ${routeId}`);
      } catch (error) {
        console.error('Error in route optimization:', error);
        socket.emit('error', {
          message: 'Error generating optimized route'
        });
      }
    } catch (error) {
      console.error('Error creating route plan:', error);
      socket.emit('error', {
        message: 'Failed to create route plan'
      });
    }
  }

  async handlePositionUpdate(socket, data) {
    try {
      console.log(`Position update from ${socket.id}:`, data);

      const {
        routeId,
        currentPosition,
        currentTime
      } = data;

      if (!routeId || !currentPosition) {
        return socket.emit('error', {
          message: 'Missing required fields for position update'
        });
      }

      const sessionInfo = this.activeRoutes.get(socket.id);
      if (!sessionInfo || sessionInfo.routeId !== routeId) {
        return socket.emit('error', {
          message: 'Not authorized for this route or session not found'
        });
      }

      try {
        const route = await RouteHistoryModel.findById(routeId);
        if (!route) {
          return socket.emit('error', {
            message: 'Route not found'
          });
        }

        const appRoute = RouteHistoryModel.transformRouteForApp(route);

        const updatedRoute = await routeOptimizationService.updateRouteRealTime(
          appRoute,
          currentPosition,
          currentTime ? new Date(currentTime) : new Date()
        );

        await RouteHistoryModel.updateRoute(routeId, {
          waypoints: updatedRoute.waypoints,
          endDate: updatedRoute.estimatedEndDate,
          timeTaken: updatedRoute.duration,
          distance: updatedRoute.distance,
          lastPositionUpdate: currentPosition,
          lastUpdateTime: new Date()
        });

        sessionInfo.lastUpdate = new Date();
        this.activeRoutes.set(socket.id, sessionInfo);

        this.io.to(`route_${routeId}`).emit('route-update', {
          routeId,
          ...updatedRoute
        });

        console.log(`Route ${routeId} updated with new position for ${socket.id}`);
      } catch (error) {
        console.error('Error finding or updating route:', error);
        socket.emit('error', {
          message: 'Error updating route'
        });
      }
    } catch (error) {
      console.error('Error updating position:', error);
      socket.emit('error', {
        message: 'Failed to update route with current position'
      });
    }
  }

  async handleAlternativesRequest(socket, data) {
    try {
      console.log(`Alternative routes request from ${socket.id}:`, data);

      const {
        routeId
      } = data;

      if (!routeId) {
        return socket.emit('error', {
          message: 'Route ID is required'
        });
      }

      const sessionInfo = this.activeRoutes.get(socket.id);
      if (!sessionInfo || sessionInfo.routeId !== routeId) {
        return socket.emit('error', {
          message: 'Not authorized for this route or session not found'
        });
      }

      try {
        const route = await RouteHistoryModel.findById(routeId);
        if (!route) {
          return socket.emit('error', {
            message: 'Route not found'
          });
        }

        const appRoute = RouteHistoryModel.transformRouteForApp(route);

        const alternatives = await routeOptimizationService.generateAlternativeRoutes(
          appRoute.startLocation,
          appRoute.endLocation,
          appRoute.cargoWeight || 25000,
          new Date(appRoute.plannedStartDate || appRoute.startDate)
        );

        socket.emit('route-alternatives', {
          routeId,
          alternatives
        });

        console.log(`Alternative routes generated for ${socket.id}, route ID: ${routeId}`);
      } catch (error) {
        console.error('Error finding route or generating alternatives:', error);
        socket.emit('error', {
          message: 'Error generating alternative routes'
        });
      }
    } catch (error) {
      console.error('Error generating alternative routes:', error);
      socket.emit('error', {
        message: 'Failed to generate alternative routes'
      });
    }
  }

  async handleRouteSelection(socket, data) {
    try {
      console.log(`Route selection from ${socket.id}:`, data);

      const {
        routeId,
        selectedRoute
      } = data;

      if (!routeId || !selectedRoute) {
        return socket.emit('error', {
          message: 'Route ID and selected route are required'
        });
      }

      const sessionInfo = this.activeRoutes.get(socket.id);
      if (!sessionInfo || sessionInfo.routeId !== routeId) {
        return socket.emit('error', {
          message: 'Not authorized for this route or session not found'
        });
      }

      try {
        const existingRoute = await RouteHistoryModel.findById(routeId);
        if (!existingRoute) {
          return socket.emit('error', {
            message: 'Route not found'
          });
        }
        const updateData = {

          waypoints: selectedRoute.waypoints,

          endDate: new Date(selectedRoute.estimatedEndDate || existingRoute.endDate),
          timeTaken: Number(selectedRoute.duration || existingRoute.timeTaken || 0),
          distance: Number(selectedRoute.distance || existingRoute.distance || 0),

          weather: {
            weatherConditions: selectedRoute.weatherConditions || existingRoute.weather?.weatherConditions || [],
            criticalConditions: selectedRoute.criticalConditions || existingRoute.weather?.criticalConditions || []
          },
          lastUpdate: new Date()
        };


        await RouteHistoryModel.updateRoute(routeId, updateData);

        this.io.to(`route_${routeId}`).emit('route-selected', {
          routeId,
          ...selectedRoute,
          selectedBy: socket.user?._id || 'anonymous',
          selectedAt: new Date()
        });

        console.log(`Route ${routeId} selection updated by ${socket.id}`);
      } catch (error) {
        console.error('Error updating route selection:', error);
        socket.emit('error', {
          message: 'Error updating route selection'
        });
      }
    } catch (error) {
      console.error('Error selecting route:', error);
      socket.emit('error', {
        message: 'Failed to select route'
      });
    }
  }

  cleanupSession(socket) {
    if (this.activeRoutes.has(socket.id)) {
      this.activeRoutes.delete(socket.id);
    }
  }
}

module.exports = new WebSocketService();