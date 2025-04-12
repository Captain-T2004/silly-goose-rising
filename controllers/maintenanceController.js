const {
  ShipModel,
  RouteHistoryModel,
  MaintenanceLogModel,
  FuelUsageModel
} = require('../models');


const getMaintenanceSchedule = async (req, res) => {
  try {
    const {
      shipId,
      months = 6
    } = req.query;

    if (!shipId) {
      return res.status(400).json({
        error: 'Ship ID is required'
      });
    }


    const ship = await ShipModel.findById(shipId);

    if (!ship) {
      return res.status(404).json({
        error: 'Ship not found'
      });
    }


    const routes = await RouteHistoryModel.findByShipId(shipId);


    const maintenanceHistory = await MaintenanceLogModel.findByShipId(shipId);


    const fuelData = await FuelUsageModel.findByShipId(shipId);


    const usageStats = calculateShipUsageStats(routes, maintenanceHistory, fuelData);


    const maintenanceSchedule = generateMaintenanceSchedule(
      ship,
      usageStats,
      maintenanceHistory,
      parseInt(months)
    );


    const upcomingRoutes = routes.filter(route =>
      route.status === 'planned' &&
      new Date(route.startDate) > new Date()
    ).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));


    const optimizedSchedule = optimizeScheduleAroundRoutes(
      maintenanceSchedule,
      upcomingRoutes
    );

    res.status(200).json({
      shipId,
      shipDetails: {
        name: ship.name,
        type: ship.type,
        age: calculateShipAge(ship),
        totalMileage: usageStats.totalMileage,
        totalEngineHours: usageStats.totalEngineHours
      },
      maintenanceHistory: formatMaintenanceHistory(maintenanceHistory),
      recommendedSchedule: optimizedSchedule,
      criticalMaintenanceItems: identifyCriticalItems(optimizedSchedule),
      nextMaintenanceWindow: findNextMaintenanceWindow(optimizedSchedule, upcomingRoutes)
    });
  } catch (error) {
    console.error('Error getting maintenance schedule:', error);
    res.status(500).json({
      error: 'Failed to generate maintenance schedule'
    });
  }
};


const calculateShipUsageStats = (routes, maintenanceHistory, fuelData) => {

  const stats = {
    totalMileage: 0,
    totalEngineHours: 0,
    mileageSinceLastMaintenance: {},
    hoursSinceLastMaintenance: {},
    averageSpeed: 0,
    averageFuelConsumption: 0,
    lastMaintenance: {}
  };


  const completedRoutes = routes.filter(route => route.status === 'completed');

  if (completedRoutes.length > 0) {
    stats.totalMileage = completedRoutes.reduce((sum, route) => sum + (route.distance || 0), 0);
    stats.totalEngineHours = completedRoutes.reduce((sum, route) => sum + (route.timeTaken || 0), 0);


    stats.averageSpeed = stats.totalEngineHours > 0 ?
      stats.totalMileage / stats.totalEngineHours : 0;
  }


  if (fuelData && fuelData.length > 0) {
    const totalFuel = fuelData.reduce((sum, record) => sum + (record.fuelConsumed || 0), 0);
    stats.averageFuelConsumption = stats.totalMileage > 0 ?
      totalFuel / stats.totalMileage : 0;
  }


  if (maintenanceHistory && maintenanceHistory.length > 0) {

    const sortedLogs = [...maintenanceHistory].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );


    const maintenanceTypes = [
      'engine', 'hull', 'propeller', 'electronics', 'safety',
      'general', 'inspection', 'overhaul'
    ];

    maintenanceTypes.forEach(type => {
      const lastMaintOfType = sortedLogs.find(
        log => log.maintenanceType === type
      );

      if (lastMaintOfType) {
        stats.lastMaintenance[type] = lastMaintOfType.date;


        const maintDate = new Date(lastMaintOfType.date);
        const routesSinceMaint = completedRoutes.filter(
          route => new Date(route.endDate) > maintDate
        );

        stats.mileageSinceLastMaintenance[type] = routesSinceMaint.reduce(
          (sum, route) => sum + (route.distance || 0), 0
        );

        stats.hoursSinceLastMaintenance[type] = routesSinceMaint.reduce(
          (sum, route) => sum + (route.timeTaken || 0), 0
        );
      }
    });
  }

  return stats;
};

const generateMaintenanceSchedule = (ship, usageStats, maintenanceHistory, monthsAhead) => {
  const schedule = [];
  const currentDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + monthsAhead);


  const intervals = getMaintenanceIntervals(ship);


  Object.keys(intervals).forEach(maintenanceType => {
    const interval = intervals[maintenanceType];
    const lastMaintenance = usageStats.lastMaintenance[maintenanceType];


    if (lastMaintenance) {
      const lastDate = new Date(lastMaintenance);


      const nextByTime = new Date(lastDate);
      nextByTime.setDate(nextByTime.getDate() + interval.days);


      let nextByMileage = null;
      if (interval.mileage && usageStats.mileageSinceLastMaintenance[maintenanceType] !== undefined) {

        const milesRemaining = interval.mileage - usageStats.mileageSinceLastMaintenance[maintenanceType];
        const milesPerDay = usageStats.totalMileage / getDaysSinceCommissioning(ship);
        const daysToMileageThreshold = milesRemaining / milesPerDay;

        nextByMileage = new Date();
        nextByMileage.setDate(nextByMileage.getDate() + daysToMileageThreshold);
      }


      let nextByHours = null;
      if (interval.engineHours && usageStats.hoursSinceLastMaintenance[maintenanceType] !== undefined) {

        const hoursRemaining = interval.engineHours - usageStats.hoursSinceLastMaintenance[maintenanceType];
        const hoursPerDay = usageStats.totalEngineHours / getDaysSinceCommissioning(ship);
        const daysToHoursThreshold = hoursRemaining / hoursPerDay;

        nextByHours = new Date();
        nextByHours.setDate(nextByHours.getDate() + daysToHoursThreshold);
      }


      let dueDate = nextByTime;

      if (nextByMileage && nextByMileage < dueDate) {
        dueDate = nextByMileage;
      }

      if (nextByHours && nextByHours < dueDate) {
        dueDate = nextByHours;
      }


      if (dueDate <= endDate) {
        schedule.push({
          maintenanceType,
          description: interval.description,
          lastPerformed: lastDate,
          dueDate,
          estimatedDuration: interval.duration,
          priority: getPriority(dueDate, interval.criticality),
          tasks: interval.tasks
        });
      }
    } else {
      const commissioningDate = new Date(ship.buildDate || ship.commissioningDate);
      const nextDue = new Date(commissioningDate);
      nextDue.setDate(nextDue.getDate() + interval.days);


      let dueDate = nextDue > currentDate ? nextDue : currentDate;


      if (dueDate <= endDate) {
        schedule.push({
          maintenanceType,
          description: interval.description,
          lastPerformed: null,
          dueDate,
          estimatedDuration: interval.duration,
          priority: getPriority(dueDate, interval.criticality),
          tasks: interval.tasks
        });
      }
    }
  });


  return schedule.sort((a, b) => a.dueDate - b.dueDate);
};

const getMaintenanceIntervals = (ship) => {

  const baseIntervals = {
    engine: {
      days: 90,
      mileage: 10000,
      engineHours: 500,
      description: 'Engine Maintenance',
      duration: 2,
      criticality: 'high',
      tasks: [
        'Oil change',
        'Filter replacement',
        'Belt inspection',
        'Cooling system check'
      ]
    },
    hull: {
      days: 180,
      description: 'Hull Inspection and Cleaning',
      duration: 3,
      criticality: 'medium',
      tasks: [
        'Hull cleaning',
        'Anti-fouling treatment',
        'Structural inspection',
        'Corrosion check'
      ]
    },
    propeller: {
      days: 180,
      mileage: 15000,
      description: 'Propeller and Shaft System',
      duration: 2,
      criticality: 'high',
      tasks: [
        'Propeller inspection',
        'Shaft alignment check',
        'Bearing inspection',
        'Seal inspection'
      ]
    },
    electronics: {
      days: 90,
      description: 'Navigation and Communication Systems',
      duration: 1,
      criticality: 'high',
      tasks: [
        'Navigation equipment calibration',
        'Communication systems check',
        'Radar inspection',
        'Software updates'
      ]
    },
    safety: {
      days: 90,
      description: 'Safety Equipment Inspection',
      duration: 1,
      criticality: 'critical',
      tasks: [
        'Life raft inspection',
        'Fire suppression systems check',
        'Emergency equipment test',
        'Safety drill'
      ]
    },
    general: {
      days: 30,
      description: 'General Inspection and Maintenance',
      duration: 1,
      criticality: 'low',
      tasks: [
        'Visual inspection',
        'Minor repairs',
        'System tests',
        'Fluid levels check'
      ]
    },
    inspection: {
      days: 365,
      description: 'Annual Regulatory Inspection',
      duration: 2,
      criticality: 'critical',
      tasks: [
        'Regulatory compliance check',
        'Documentation review',
        'Safety certification',
        'Environmental compliance'
      ]
    },
    overhaul: {
      days: 730,
      engineHours: 10000,
      description: 'Major Overhaul',
      duration: 14,
      criticality: 'high',
      tasks: [
        'Engine overhaul',
        'Major systems rebuild',
        'Structural reinforcement',
        'Technology upgrade'
      ]
    }
  };


  const shipTypeAdjustments = {
    tanker: {
      hull: {
        days: 120
      },
      safety: {
        days: 60
      }
    },
    container: {
      propeller: {
        days: 150
      },
      electronics: {
        days: 75
      }
    },
    passenger: {
      safety: {
        days: 45
      },
      general: {
        days: 20
      }
    },
    bulk: {
      hull: {
        days: 150
      }
    }
  };


  const shipAge = calculateShipAge(ship);
  let ageMultiplier = 1.0;

  if (shipAge < 5) {
    ageMultiplier = 1.2;
  } else if (shipAge > 15) {
    ageMultiplier = 0.8;
  } else if (shipAge > 25) {
    ageMultiplier = 0.6;
  }


  const adjustedIntervals = {
    ...baseIntervals
  };


  if (ship.type && shipTypeAdjustments[ship.type]) {
    const typeAdjustments = shipTypeAdjustments[ship.type];

    Object.keys(typeAdjustments).forEach(maintenanceType => {
      if (adjustedIntervals[maintenanceType]) {
        adjustedIntervals[maintenanceType] = {
          ...adjustedIntervals[maintenanceType],
          ...typeAdjustments[maintenanceType]
        };
      }
    });
  }


  Object.keys(adjustedIntervals).forEach(key => {
    if (adjustedIntervals[key].days) {
      adjustedIntervals[key].days = Math.round(adjustedIntervals[key].days * ageMultiplier);
    }
  });

  return adjustedIntervals;
};

const calculateShipAge = (ship) => {
  const buildDate = new Date(ship.buildDate || ship.commissioningDate || Date.now());
  const ageInMs = Date.now() - buildDate.getTime();
  return ageInMs / (1000 * 60 * 60 * 24 * 365);
};

const getDaysSinceCommissioning = (ship) => {
  const buildDate = new Date(ship.buildDate || ship.commissioningDate || Date.now());
  const ageInMs = Date.now() - buildDate.getTime();
  return ageInMs / (1000 * 60 * 60 * 24);
};

const getPriority = (dueDate, criticality) => {
  const daysUntilDue = (dueDate - new Date()) / (1000 * 60 * 60 * 24);


  if (criticality === 'critical' && daysUntilDue < 30) {
    return 'urgent';
  }


  if (daysUntilDue < 0) {
    return 'overdue';
  }


  if ((criticality === 'critical' && daysUntilDue < 60) ||
    (criticality === 'high' && daysUntilDue < 30) ||
    (criticality === 'medium' && daysUntilDue < 15)) {
    return 'high';
  }


  if ((criticality === 'critical' && daysUntilDue < 90) ||
    (criticality === 'high' && daysUntilDue < 60) ||
    (criticality === 'medium' && daysUntilDue < 30) ||
    (criticality === 'low' && daysUntilDue < 15)) {
    return 'medium';
  }


  return 'low';
};

const optimizeScheduleAroundRoutes = (schedule, routes) => {

  if (!routes || routes.length === 0) {
    return schedule;
  }

  const optimizedSchedule = [...schedule];


  optimizedSchedule.forEach(item => {
    const dueDate = new Date(item.dueDate);
    const maintenanceDuration = item.estimatedDuration || 1;


    for (const route of routes) {
      const routeStart = new Date(route.startDate);
      const routeEnd = new Date(route.endDate);


      const maintenanceStart = new Date(dueDate);
      const maintenanceEnd = new Date(dueDate);
      maintenanceEnd.setDate(maintenanceEnd.getDate() + maintenanceDuration);


      const overlaps = (maintenanceStart <= routeEnd && maintenanceEnd >= routeStart);

      if (overlaps) {


        const daysBefore = (routeStart - maintenanceEnd) / (1000 * 60 * 60 * 24);

        if (daysBefore >= 0) {

          item.dueDate = new Date(routeStart);
          item.dueDate.setDate(item.dueDate.getDate() - maintenanceDuration);
          item.adjustmentReason = 'Scheduled before planned route';
          break;
        }


        const proposedDate = new Date(routeEnd);
        proposedDate.setDate(proposedDate.getDate() + 1);


        let conflictsWithNext = false;
        const maintenanceEndAfterRoute = new Date(proposedDate);
        maintenanceEndAfterRoute.setDate(maintenanceEndAfterRoute.getDate() + maintenanceDuration);

        for (const nextRoute of routes) {
          const nextStart = new Date(nextRoute.startDate);
          if (nextStart > routeEnd && maintenanceEndAfterRoute >= nextStart) {
            conflictsWithNext = true;
            break;
          }
        }

        if (!conflictsWithNext) {
          item.dueDate = proposedDate;
          item.adjustmentReason = 'Scheduled after planned route';
          break;
        }


        item.dueDate = findMaintenanceGap(routes, maintenanceDuration, dueDate);
        item.adjustmentReason = 'Rescheduled to fit between routes';
      }
    }


    item.priority = getPriority(new Date(item.dueDate), item.criticality || 'medium');
  });


  return optimizedSchedule.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
};

const findMaintenanceGap = (routes, duration, preferredDate) => {

  const sortedRoutes = [...routes].sort((a, b) =>
    new Date(a.startDate) - new Date(b.startDate)
  );


  const gaps = [];

  for (let i = 0; i < sortedRoutes.length - 1; i++) {
    const currentRouteEnd = new Date(sortedRoutes[i].endDate);
    const nextRouteStart = new Date(sortedRoutes[i + 1].startDate);

    const gapDays = (nextRouteStart - currentRouteEnd) / (1000 * 60 * 60 * 24);

    if (gapDays >= duration + 1) {
      gaps.push({
        start: new Date(currentRouteEnd.getTime() + 86400000),
        end: new Date(nextRouteStart.getTime() - 86400000),
        duration: gapDays
      });
    }
  }


  if (gaps.length === 0) {
    if (sortedRoutes.length > 0) {
      const lastRoute = sortedRoutes[sortedRoutes.length - 1];
      const dayAfterLastRoute = new Date(lastRoute.endDate);
      dayAfterLastRoute.setDate(dayAfterLastRoute.getDate() + 1);
      return dayAfterLastRoute;
    }
    return preferredDate;
  }


  let bestGap = gaps[0];
  let minDifference = Math.abs(preferredDate - bestGap.start);

  for (const gap of gaps) {
    const difference = Math.abs(preferredDate - gap.start);
    if (difference < minDifference) {
      minDifference = difference;
      bestGap = gap;
    }
  }


  return bestGap.start;
};

const formatMaintenanceHistory = (history) => {
  if (!history || history.length === 0) {
    return [];
  }

  return history.map(item => ({
    maintenanceType: item.maintenanceType,
    description: item.description,
    date: item.date,
    duration: item.duration,
    tasks: item.tasks,
    notes: item.notes
  })).sort((a, b) => new Date(b.date) - new Date(a.date));
};


const identifyCriticalItems = (schedule) => {
  return schedule.filter(item =>
    item.priority === 'urgent' || item.priority === 'overdue'
  );
};


const findNextMaintenanceWindow = (schedule, routes) => {
  if (!routes || routes.length === 0) {

    return {
      start: new Date(),
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      duration: 7,
      conflictingRoutes: []
    };
  }


  const sortedRoutes = [...routes].sort((a, b) =>
    new Date(a.startDate) - new Date(b.startDate)
  );


  const now = new Date();
  const firstRouteStart = new Date(sortedRoutes[0].startDate);
  const daysUntilFirstRoute = (firstRouteStart - now) / (1000 * 60 * 60 * 24);

  if (daysUntilFirstRoute > 3) {
    return {
      start: now,
      end: new Date(firstRouteStart.getTime() - 86400000),
      duration: Math.floor(daysUntilFirstRoute),
      conflictingRoutes: []
    };
  }


  for (let i = 0; i < sortedRoutes.length - 1; i++) {
    const currentRouteEnd = new Date(sortedRoutes[i].endDate);
    const nextRouteStart = new Date(sortedRoutes[i + 1].startDate);


    if (currentRouteEnd < now) continue;

    const gapDays = (nextRouteStart - currentRouteEnd) / (1000 * 60 * 60 * 24);

    if (gapDays >= 3) {
      return {
        start: new Date(currentRouteEnd.getTime() + 86400000),
        end: new Date(nextRouteStart.getTime() - 86400000),
        duration: Math.floor(gapDays - 2),
        conflictingRoutes: []
      };
    }
  }


  const lastRoute = sortedRoutes[sortedRoutes.length - 1];
  const dayAfterLastRoute = new Date(lastRoute.endDate);
  dayAfterLastRoute.setDate(dayAfterLastRoute.getDate() + 1);

  return {
    start: dayAfterLastRoute,
    end: new Date(dayAfterLastRoute.getTime() + 14 * 86400000),
    duration: 14,
    conflictingRoutes: []
  };
};

module.exports = {
  getMaintenanceSchedule
};