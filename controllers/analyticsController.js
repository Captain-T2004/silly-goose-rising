const {
  RouteHistoryModel,
  FuelUsageModel,
  ShipModel
} = require('../models');

const getAnalytics = async (req, res) => {
  try {
    const {
      shipId,
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      view = 'overview'
    } = req.query;

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (parsedEndDate < parsedStartDate) {
      return res.status(400).json({
        error: 'End date must be after start date'
      });
    }

    const routesQuery = {
      status: 'completed',
      endDate: {
        $gte: parsedStartDate,
        $lte: parsedEndDate
      }
    };

    if (shipId) {
      routesQuery.shipId = shipId;
    }

    const routes = await RouteHistoryModel.findAllByQuery(routesQuery);
    console.log(routes);

    const fuelQuery = {
      date: {
        $gte: parsedStartDate,
        $lte: parsedEndDate
      }
    };

    if (shipId) {
      fuelQuery.shipId = shipId;
    }

    const fuelData = await FuelUsageModel.findByQuery(fuelQuery);
    console.log(fuelData);

    let shipData = null;
    if (shipId) {
      shipData = await ShipModel.findById(shipId);
    }

    let analyticsData = {};

    switch (view) {
      case 'fuel':
        analyticsData = generateFuelAnalytics(routes, fuelData);
        break;
      case 'routes':
        analyticsData = generateRouteAnalytics(routes);
        break;
      case 'overview':
      default:
        analyticsData = generateOverviewAnalytics(routes, fuelData, shipData);
    }

    analyticsData.period = {
      start: parsedStartDate,
      end: parsedEndDate
    };

    if (shipData) {
      analyticsData.shipInfo = {
        id: shipId,
        name: shipData.name,
        type: shipData.type
      };
    }

    res.status(200).json(analyticsData);
  } catch (error) {
    console.error('Error generating analytics:', error);
    res.status(500).json({
      error: 'Failed to generate analytics'
    });
  }
};

function generateOverviewAnalytics(routes, fuelData, shipData) {

  const summary = calculateSummaryStats(routes, fuelData);

  const trends = calculateMonthlyTrends(routes, fuelData);

  const routeEfficiency = analyzeRouteEfficiency(routes);

  const fuelEfficiency = analyzeFuelEfficiency(routes, fuelData);

  const insights = generateInsights(routes, fuelData, shipData);

  return {
    summary,
    trends,
    routeEfficiency,
    fuelEfficiency,
    insights
  };
}

function generateFuelAnalytics(routes, fuelData) {

  const totalFuel = fuelData.reduce((sum, record) => sum + (record.fuelConsumed || 0), 0);
  const totalDistance = routes.reduce((sum, route) => sum + (route.distance || 0), 0);
  const avgFuelPerMile = totalDistance > 0 ? totalFuel / totalDistance : 0;

  const fuelByRouteType = {};

  routes.forEach(route => {
    if (route.routeType) {
      const routeId = route._id.toString();
      const fuelRecord = fuelData.find(f => f.routeId === routeId);

      if (fuelRecord) {
        if (!fuelByRouteType[route.routeType]) {
          fuelByRouteType[route.routeType] = {
            routes: 0,
            totalFuel: 0,
            totalDistance: 0
          };
        }

        fuelByRouteType[route.routeType].routes++;
        fuelByRouteType[route.routeType].totalFuel += fuelRecord.fuelConsumed || 0;
        fuelByRouteType[route.routeType].totalDistance += route.distance || 0;
      }
    }
  });

  Object.keys(fuelByRouteType).forEach(type => {
    const data = fuelByRouteType[type];
    data.avgFuelPerMile = data.totalDistance > 0 ? data.totalFuel / data.totalDistance : 0;
  });

  const fuelByCargoWeight = {
    'light': {
      range: '0-10000',
      routes: 0,
      totalFuel: 0,
      totalDistance: 0
    },
    'medium': {
      range: '10001-20000',
      routes: 0,
      totalFuel: 0,
      totalDistance: 0
    },
    'heavy': {
      range: '20001-30000',
      routes: 0,
      totalFuel: 0,
      totalDistance: 0
    },
    'very-heavy': {
      range: '30001+',
      routes: 0,
      totalFuel: 0,
      totalDistance: 0
    }
  };

  routes.forEach(route => {
    if (route.cargoWeight !== undefined) {
      const routeId = route._id.toString();
      const fuelRecord = fuelData.find(f => f.routeId === routeId);

      if (fuelRecord) {
        let weightCategory = 'medium';

        if (route.cargoWeight <= 10000) {
          weightCategory = 'light';
        } else if (route.cargoWeight <= 20000) {
          weightCategory = 'medium';
        } else if (route.cargoWeight <= 30000) {
          weightCategory = 'heavy';
        } else {
          weightCategory = 'very-heavy';
        }

        fuelByCargoWeight[weightCategory].routes++;
        fuelByCargoWeight[weightCategory].totalFuel += fuelRecord.fuelConsumed || 0;
        fuelByCargoWeight[weightCategory].totalDistance += route.distance || 0;
      }
    }
  });

  Object.keys(fuelByCargoWeight).forEach(category => {
    const data = fuelByCargoWeight[category];
    data.avgFuelPerMile = data.totalDistance > 0 ? data.totalFuel / data.totalDistance : 0;
  });

  const fuelByMonth = {};

  fuelData.forEach(record => {
    const month = new Date(record.date).toISOString().substr(0, 7);

    if (!fuelByMonth[month]) {
      fuelByMonth[month] = {
        totalFuel: 0,
        totalDistance: 0,
        count: 0
      };
    }

    fuelByMonth[month].totalFuel += record.fuelConsumed || 0;
    fuelByMonth[month].count++;

    const route = routes.find(r => r._id.toString() === record.routeId);
    if (route) {
      fuelByMonth[month].totalDistance += route.distance || 0;
    }
  });

  const fuelTrends = Object.keys(fuelByMonth).map(month => {
    const data = fuelByMonth[month];
    return {
      month,
      totalFuel: data.totalFuel,
      totalDistance: data.totalDistance,
      avgFuelPerMile: data.totalDistance > 0 ? data.totalFuel / data.totalDistance : 0,
      count: data.count
    };
  }).sort((a, b) => a.month.localeCompare(b.month));

  return {
    summary: {
      totalFuelConsumed: totalFuel,
      totalDistance,
      avgFuelPerMile,
      routesAnalyzed: routes.length
    },
    fuelByRouteType,
    fuelByCargoWeight,
    fuelTrends,
    recommendations: generateFuelRecommendations(routes, fuelData)
  };
}

function generateRouteAnalytics(routes) {
  if (routes.length === 0) {
    return {
      summary: {
        totalRoutes: 0,
        totalDistance: 0,
        avgDuration: 0,
        avgSpeed: 0
      },
      routeTypes: {},
      mostEfficient: [],
      leastEfficient: []
    };
  }

  const totalRoutes = routes.length;
  const totalDistance = routes.reduce((sum, route) => sum + (route.distance || 0), 0);
  const totalDuration = routes.reduce((sum, route) => sum + (route.timeTaken || route.duration || 0), 0);
  const avgDuration = totalRoutes > 0 ? totalDuration / totalRoutes : 0;
  const avgSpeed = totalDuration > 0 ? totalDistance / totalDuration : 0;

  const routeTypes = {};

  routes.forEach(route => {
    const routeType = route.routeType || 'standard';

    if (!routeTypes[routeType]) {
      routeTypes[routeType] = {
        count: 0,
        totalDistance: 0,
        totalDuration: 0
      };
    }

    routeTypes[routeType].count++;
    routeTypes[routeType].totalDistance += route.distance || 0;
    routeTypes[routeType].totalDuration += route.timeTaken || route.duration || 0;
  });

  Object.keys(routeTypes).forEach(type => {
    const data = routeTypes[type];
    data.avgDistance = data.count > 0 ? data.totalDistance / data.count : 0;
    data.avgDuration = data.count > 0 ? data.totalDuration / data.count : 0;
    data.avgSpeed = data.totalDuration > 0 ? data.totalDistance / data.totalDuration : 0;
  });

  const routesWithScores = routes.map(route => {

    const duration = route.timeTaken || route.duration || 1;
    const speed = route.distance / duration;
    const efficiencyScore = (route.distance || 0) / (duration * (speed || 1));

    return {
      ...route,
      efficiencyScore
    };
  });

  routesWithScores.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  const mostEfficient = routesWithScores.slice(0, 5).map(route => ({
    _id: route._id,
    shipId: route.shipId,
    startLocation: route.startLocation,
    endLocation: route.endLocation,
    distance: route.distance,
    duration: route.timeTaken || route.duration,
    averageSpeed: route.distance / (route.timeTaken || route.duration || 1),
    efficiencyScore: route.efficiencyScore,
    date: route.endDate
  }));

  const leastEfficient = routesWithScores.slice(-5).reverse().map(route => ({
    _id: route._id,
    shipId: route.shipId,
    startLocation: route.startLocation,
    endLocation: route.endLocation,
    distance: route.distance,
    duration: route.timeTaken || route.duration,
    averageSpeed: route.distance / (route.timeTaken || route.duration || 1),
    efficiencyScore: route.efficiencyScore,
    date: route.endDate
  }));

  return {
    summary: {
      totalRoutes,
      totalDistance,
      avgDuration,
      avgSpeed
    },
    routeTypes,
    mostEfficient,
    leastEfficient,
    recommendations: generateRouteRecommendations(routes)
  };
}

function calculateSummaryStats(routes, fuelData) {
  if (routes.length === 0) {
    return {
      routesCompleted: 0,
      totalDistance: 0,
      avgDuration: 0,
      avgSpeed: 0,
      fuelConsumed: 0,
      avgFuelPerMile: 0
    };
  }

  const routesCompleted = routes.length;
  const totalDistance = routes.reduce((sum, route) => sum + (route.distance || 0), 0);
  const totalDuration = routes.reduce((sum, route) => sum + (route.timeTaken || route.duration || 0), 0);
  const avgDuration = routesCompleted > 0 ? totalDuration / routesCompleted : 0;
  const avgSpeed = totalDuration > 0 ? totalDistance / totalDuration : 0;

  const totalFuel = fuelData.reduce((sum, record) => sum + (record.fuelConsumed || 0), 0);
  const avgFuelPerMile = totalDistance > 0 ? totalFuel / totalDistance : 0;

  return {
    routesCompleted,
    totalDistance,
    avgDuration,
    avgSpeed,
    fuelConsumed: totalFuel,
    avgFuelPerMile
  };
}

function calculateMonthlyTrends(routes, fuelData) {
  const monthlyData = {};

  routes.forEach(route => {
    const month = new Date(route.endDate).toISOString().substr(0, 7);

    if (!monthlyData[month]) {
      monthlyData[month] = {
        routeCount: 0,
        totalDistance: 0,
        totalDuration: 0,
        totalFuel: 0
      };
    }

    monthlyData[month].routeCount++;
    monthlyData[month].totalDistance += route.distance || 0;
    monthlyData[month].totalDuration += route.timeTaken || route.duration || 0;

    const fuelRecord = fuelData.find(f => f.routeId === route._id.toString());
    if (fuelRecord) {
      monthlyData[month].totalFuel += fuelRecord.fuelConsumed || 0;
    }
  });

  Object.keys(monthlyData).forEach(month => {
    const data = monthlyData[month];
    data.avgDistance = data.routeCount > 0 ? data.totalDistance / data.routeCount : 0;
    data.avgDuration = data.routeCount > 0 ? data.totalDuration / data.routeCount : 0;
    data.avgSpeed = data.totalDuration > 0 ? data.totalDistance / data.totalDuration : 0;
    data.avgFuelPerMile = data.totalDistance > 0 ? data.totalFuel / data.totalDistance : 0;
  });

  const trends = Object.keys(monthlyData).map(month => ({
    month,
    ...monthlyData[month]
  })).sort((a, b) => a.month.localeCompare(b.month));

  return trends;
}

function analyzeRouteEfficiency(routes) {
  if (routes.length === 0) {
    return {
      routeTypeDistribution: {},
      avgSpeedByRouteType: {},
      mostEfficientRouteType: null
    };
  }

  const routeTypeCount = {};
  const routeTypeEfficiency = {};

  routes.forEach(route => {
    const routeType = route.routeType || 'standard';

    if (!routeTypeCount[routeType]) {
      routeTypeCount[routeType] = 0;
      routeTypeEfficiency[routeType] = {
        totalDistance: 0,
        totalDuration: 0
      };
    }

    routeTypeCount[routeType]++;
    routeTypeEfficiency[routeType].totalDistance += route.distance || 0;
    routeTypeEfficiency[routeType].totalDuration += route.timeTaken || route.duration || 0;
  });

  const routeTypeDistribution = {};
  Object.keys(routeTypeCount).forEach(type => {
    routeTypeDistribution[type] = (routeTypeCount[type] / routes.length) * 100;
  });

  const avgSpeedByRouteType = {};
  Object.keys(routeTypeEfficiency).forEach(type => {
    const data = routeTypeEfficiency[type];
    avgSpeedByRouteType[type] = data.totalDuration > 0 ? data.totalDistance / data.totalDuration : 0;
  });

  let mostEfficientType = null;
  let highestEfficiency = 0;

  Object.keys(avgSpeedByRouteType).forEach(type => {
    if (avgSpeedByRouteType[type] > highestEfficiency) {
      highestEfficiency = avgSpeedByRouteType[type];
      mostEfficientType = type;
    }
  });

  return {
    routeTypeDistribution,
    avgSpeedByRouteType,
    mostEfficientRouteType: mostEfficientType
  };
}

function analyzeFuelEfficiency(routes, fuelData) {
  if (routes.length === 0 || fuelData.length === 0) {
    return {
      avgFuelPerMile: 0,
      fuelEfficiencyByRouteType: {},
      fuelEfficiencyByCargoWeight: {}
    };
  }

  const totalDistance = routes.reduce((sum, route) => sum + (route.distance || 0), 0);
  const totalFuel = fuelData.reduce((sum, record) => sum + (record.fuelConsumed || 0), 0);
  const avgFuelPerMile = totalDistance > 0 ? totalFuel / totalDistance : 0;

  const fuelByRouteType = {};

  routes.forEach(route => {
    const routeType = route.routeType || 'standard';
    const routeId = route._id.toString();
    const fuelRecord = fuelData.find(f => f.routeId === routeId);

    if (fuelRecord) {
      if (!fuelByRouteType[routeType]) {
        fuelByRouteType[routeType] = {
          totalDistance: 0,
          totalFuel: 0
        };
      }

      fuelByRouteType[routeType].totalDistance += route.distance || 0;
      fuelByRouteType[routeType].totalFuel += fuelRecord.fuelConsumed || 0;
    }
  });

  const fuelEfficiencyByRouteType = {};
  Object.keys(fuelByRouteType).forEach(type => {
    const data = fuelByRouteType[type];
    fuelEfficiencyByRouteType[type] = data.totalDistance > 0 ?
      data.totalFuel / data.totalDistance : 0;
  });

  const fuelByCargoWeight = {
    'light': {
      range: '0-10000',
      totalDistance: 0,
      totalFuel: 0
    },
    'medium': {
      range: '10001-20000',
      totalDistance: 0,
      totalFuel: 0
    },
    'heavy': {
      range: '20001-30000',
      totalDistance: 0,
      totalFuel: 0
    },
    'very-heavy': {
      range: '30001+',
      totalDistance: 0,
      totalFuel: 0
    }
  };

  routes.forEach(route => {
    if (route.cargoWeight !== undefined) {
      const routeId = route._id.toString();
      const fuelRecord = fuelData.find(f => f.routeId === routeId);

      if (fuelRecord) {
        let weightCategory = 'medium';

        if (route.cargoWeight <= 10000) {
          weightCategory = 'light';
        } else if (route.cargoWeight <= 20000) {
          weightCategory = 'medium';
        } else if (route.cargoWeight <= 30000) {
          weightCategory = 'heavy';
        } else {
          weightCategory = 'very-heavy';
        }

        fuelByCargoWeight[weightCategory].totalDistance += route.distance || 0;
        fuelByCargoWeight[weightCategory].totalFuel += fuelRecord.fuelConsumed || 0;
      }
    }
  });

  const fuelEfficiencyByCargoWeight = {};
  Object.keys(fuelByCargoWeight).forEach(category => {
    const data = fuelByCargoWeight[category];
    fuelEfficiencyByCargoWeight[category] = {
      range: data.range,
      fuelPerMile: data.totalDistance > 0 ? data.totalFuel / data.totalDistance : 0
    };
  });

  return {
    avgFuelPerMile,
    fuelEfficiencyByRouteType,
    fuelEfficiencyByCargoWeight
  };
}

function generateInsights(routes, fuelData, shipData) {
  const insights = [];

  if (routes.length === 0) {
    return [{
      type: 'info',
      message: 'Not enough data to generate insights. Complete more routes to see analytics.'
    }];
  }

  const routeTypeCount = {};
  const routeTypeEfficiency = {};

  routes.forEach(route => {
    const routeType = route.routeType || 'standard';
    const routeId = route._id.toString();
    const fuelRecord = fuelData.find(f => f.routeId === routeId);

    if (!routeTypeCount[routeType]) {
      routeTypeCount[routeType] = 0;
      routeTypeEfficiency[routeType] = {
        totalDistance: 0,
        totalFuel: 0
      };
    }

    routeTypeCount[routeType]++;
    routeTypeEfficiency[routeType].totalDistance += route.distance || 0;

    if (fuelRecord) {
      routeTypeEfficiency[routeType].totalFuel += fuelRecord.fuelConsumed || 0;
    }
  });

  const routeTypeFuelEfficiency = {};
  Object.keys(routeTypeEfficiency).forEach(type => {
    const data = routeTypeEfficiency[type];
    routeTypeFuelEfficiency[type] = data.totalDistance > 0 && data.totalFuel > 0 ?
      data.totalDistance / data.totalFuel : 0;
  });

  let mostEfficientType = null;
  let highestEfficiency = 0;

  Object.entries(routeTypeFuelEfficiency).forEach(([type, efficiency]) => {
    if (efficiency > highestEfficiency) {
      highestEfficiency = efficiency;
      mostEfficientType = type;
    }
  });

  if (mostEfficientType && Object.keys(routeTypeCount).length > 1) {
    insights.push({
      type: 'optimization',
      message: `Routes using "${mostEfficientType}" strategy are the most fuel-efficient. Consider using this strategy more frequently.`,
      data: {
        mostEfficientType,
        efficiency: highestEfficiency,
        comparison: routeTypeFuelEfficiency
      }
    });
  }

  const speedData = {};

  routes.forEach(route => {
    const duration = route.timeTaken || route.duration || 0;
    if (duration > 0) {
      const speed = route.distance / duration;
      const speedRange = Math.floor(speed / 5) * 5;

      if (!speedData[speedRange]) {
        speedData[speedRange] = {
          count: 0,
          totalDistance: 0,
          totalFuel: 0
        };
      }

      speedData[speedRange].count++;
      speedData[speedRange].totalDistance += route.distance || 0;

      const routeId = route._id.toString();
      const fuelRecord = fuelData.find(f => f.routeId === routeId);

      if (fuelRecord) {
        speedData[speedRange].totalFuel += fuelRecord.fuelConsumed || 0;
      }
    }
  });

  const speedEfficiency = {};
  Object.keys(speedData).forEach(range => {
    const data = speedData[range];
    speedEfficiency[range] = data.totalDistance > 0 && data.totalFuel > 0 ?
      data.totalDistance / data.totalFuel : 0;
  });

  let mostEfficientSpeedRange = null;
  let highestSpeedEfficiency = 0;

  Object.entries(speedEfficiency).forEach(([range, efficiency]) => {
    if (efficiency > highestSpeedEfficiency && speedData[range].count >= 3) {
      highestSpeedEfficiency = efficiency;
      mostEfficientSpeedRange = parseInt(range);
    }
  });

  if (mostEfficientSpeedRange !== null) {
    insights.push({
      type: 'speed',
      message: `Speed optimization: Routes operated at ${mostEfficientSpeedRange}-${mostEfficientSpeedRange+5} km/h demonstrate the best fuel efficiency. Consider adjusting cruise speeds to this range when possible.`,
      data: {
        optimalSpeedRange: `${mostEfficientSpeedRange}-${mostEfficientSpeedRange+5} km/h`,
        efficiency: highestSpeedEfficiency
      }
    });
  }

  const cargoData = {
    'light': {
      range: '0-10000',
      totalDistance: 0,
      totalFuel: 0,
      count: 0
    },
    'medium': {
      range: '10001-20000',
      totalDistance: 0,
      totalFuel: 0,
      count: 0
    },
    'heavy': {
      range: '20001-30000',
      totalDistance: 0,
      totalFuel: 0,
      count: 0
    },
    'very-heavy': {
      range: '30001+',
      totalDistance: 0,
      totalFuel: 0,
      count: 0
    }
  };

  routes.forEach(route => {
    if (route.cargoWeight !== undefined) {
      let category = 'medium';

      if (route.cargoWeight <= 10000) {
        category = 'light';
      } else if (route.cargoWeight <= 20000) {
        category = 'medium';
      } else if (route.cargoWeight <= 30000) {
        category = 'heavy';
      } else {
        category = 'very-heavy';
      }

      cargoData[category].count++;
      cargoData[category].totalDistance += route.distance || 0;

      const routeId = route._id.toString();
      const fuelRecord = fuelData.find(f => f.routeId === routeId);

      if (fuelRecord) {
        cargoData[category].totalFuel += fuelRecord.fuelConsumed || 0;
      }
    }
  });

  const significantCategories = [];
  Object.keys(cargoData).forEach(category => {
    const data = cargoData[category];
    if (data.count >= 2 && data.totalDistance > 0 && data.totalFuel > 0) {
      data.efficiency = data.totalDistance / data.totalFuel;
      significantCategories.push({
        category,
        efficiency: data.efficiency,
        count: data.count
      });
    }
  });

  if (significantCategories.length >= 2) {
    significantCategories.sort((a, b) => b.efficiency - a.efficiency);

    insights.push({
      type: 'cargo',
      message: `Cargo weight analysis: ${significantCategories[0].category} loads (${cargoData[significantCategories[0].category].range} tons) are most fuel-efficient for this ${shipData ? shipData.type + ' ship' : 'vessel'}.`,
      data: {
        mostEfficientCategory: significantCategories[0].category,
        categoryData: cargoData
      }
    });
  }

  const monthlyData = {};

  routes.forEach(route => {
    const month = new Date(route.endDate).toISOString().substr(0, 7);

    if (!monthlyData[month]) {
      monthlyData[month] = {
        routeCount: 0,
        totalDistance: 0,
        totalFuel: 0
      };
    }

    monthlyData[month].routeCount++;
    monthlyData[month].totalDistance += route.distance || 0;

    const routeId = route._id.toString();
    const fuelRecord = fuelData.find(f => f.routeId === routeId);

    if (fuelRecord) {
      monthlyData[month].totalFuel += fuelRecord.fuelConsumed || 0;
    }
  });

  const monthlyEfficiency = [];
  Object.keys(monthlyData).forEach(month => {
    const data = monthlyData[month];
    if (data.totalDistance > 0 && data.totalFuel > 0) {
      monthlyEfficiency.push({
        month,
        efficiency: data.totalDistance / data.totalFuel
      });
    }
  });

  if (monthlyEfficiency.length >= 2) {
    monthlyEfficiency.sort((a, b) => a.month.localeCompare(b.month));

    const firstMonth = monthlyEfficiency[0];
    const lastMonth = monthlyEfficiency[monthlyEfficiency.length - 1];

    const efficiencyChange = ((lastMonth.efficiency - firstMonth.efficiency) / firstMonth.efficiency) * 100;

    if (Math.abs(efficiencyChange) >= 5) {
      const trend = efficiencyChange > 0 ? 'improving' : 'declining';

      insights.push({
        type: 'trend',
        message: `Fuel efficiency is ${trend} (${Math.abs(efficiencyChange).toFixed(1)}% ${trend === 'improving' ? 'better' : 'worse'} than in ${firstMonth.month}).`,
        data: {
          trend,
          changePercent: efficiencyChange,
          monthlyData: monthlyEfficiency
        }
      });
    }
  }

  return insights;
}

function generateFuelRecommendations(routes, fuelData) {
  const recommendations = [];

  if (routes.length === 0 || fuelData.length === 0) {
    return recommendations;
  }

  const routeTypeEfficiency = {};

  routes.forEach(route => {
    const routeType = route.routeType || 'standard';
    const routeId = route._id.toString();
    const fuelRecord = fuelData.find(f => f.routeId === routeId);

    if (fuelRecord) {
      if (!routeTypeEfficiency[routeType]) {
        routeTypeEfficiency[routeType] = {
          routes: 0,
          totalDistance: 0,
          totalFuel: 0
        };
      }

      routeTypeEfficiency[routeType].routes++;
      routeTypeEfficiency[routeType].totalDistance += route.distance || 0;
      routeTypeEfficiency[routeType].totalFuel += fuelRecord.fuelConsumed || 0;
    }
  });

  Object.keys(routeTypeEfficiency).forEach(type => {
    const data = routeTypeEfficiency[type];
    if (data.totalDistance > 0) {
      data.fuelPerMile = data.totalFuel / data.totalDistance;
    }
  });

  let mostEfficientType = null;
  let bestEfficiency = Infinity;

  Object.entries(routeTypeEfficiency).forEach(([type, data]) => {
    if (data.routes >= 2 && data.fuelPerMile < bestEfficiency) {
      bestEfficiency = data.fuelPerMile;
      mostEfficientType = type;
    }
  });

  if (mostEfficientType) {
    recommendations.push({
      category: 'route-strategy',
      recommendation: `Use "${mostEfficientType}" route strategy where possible for best fuel efficiency.`,
      impact: 'high'
    });
  }

  const speedEfficiency = {};

  routes.forEach(route => {
    if (route.timeTaken || route.duration) {
      const duration = route.timeTaken || route.duration;
      const speed = route.distance / duration;
      const speedBin = Math.round(speed / 2.5) * 2.5;

      const routeId = route._id.toString();
      const fuelRecord = fuelData.find(f => f.routeId === routeId);

      if (fuelRecord) {
        if (!speedEfficiency[speedBin]) {
          speedEfficiency[speedBin] = {
            routes: 0,
            totalDistance: 0,
            totalFuel: 0
          };
        }

        speedEfficiency[speedBin].routes++;
        speedEfficiency[speedBin].totalDistance += route.distance || 0;
        speedEfficiency[speedBin].totalFuel += fuelRecord.fuelConsumed || 0;
      }
    }
  });

  Object.keys(speedEfficiency).forEach(speed => {
    const data = speedEfficiency[speed];
    if (data.totalDistance > 0) {
      data.fuelPerMile = data.totalFuel / data.totalDistance;
    }
  });

  let optimalSpeed = null;
  let bestSpeedEfficiency = Infinity;

  Object.entries(speedEfficiency).forEach(([speed, data]) => {
    if (data.routes >= 2 && data.fuelPerMile < bestSpeedEfficiency) {
      bestSpeedEfficiency = data.fuelPerMile;
      optimalSpeed = parseFloat(speed);
    }
  });

  if (optimalSpeed !== null) {
    recommendations.push({
      category: 'speed',
      recommendation: `Maintain cruising speed at approximately ${optimalSpeed}-${optimalSpeed + 2.5} km/h for optimal fuel efficiency.`,
      impact: 'high'
    });
  }

  if (routeTypeEfficiency['weather-optimized'] && routeTypeEfficiency['direct']) {
    const weatherRoutes = routeTypeEfficiency['weather-optimized'];
    const directRoutes = routeTypeEfficiency['direct'];

    if (weatherRoutes.routes >= 2 && directRoutes.routes >= 2) {
      const weatherEfficiency = weatherRoutes.fuelPerMile;
      const directEfficiency = directRoutes.fuelPerMile;

      const improvementPercent = ((directEfficiency - weatherEfficiency) / directEfficiency) * 100;

      if (improvementPercent > 5) {
        recommendations.push({
          category: 'weather',
          recommendation: `Weather-optimized routes use ${improvementPercent.toFixed(1)}% less fuel than direct routes. Prioritize weather optimization.`,
          impact: 'medium'
        });
      }
    }
  }

  return recommendations;
}

function generateRouteRecommendations(routes) {
  const recommendations = [];

  if (routes.length === 0) {
    return recommendations;
  }

  const speeds = routes.map(route => {
    const duration = route.timeTaken || route.duration || 1;
    return route.distance / duration;
  }).filter(speed => speed > 0);

  if (speeds.length > 0) {

    const avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;

    const highSpeedRoutes = routes.filter(route => {
      const duration = route.timeTaken || route.duration || 1;
      const speed = route.distance / duration;
      return speed > avgSpeed * 1.2;
    });

    if (highSpeedRoutes.length > 0 && highSpeedRoutes.length <= routes.length * 0.3) {
      recommendations.push({
        category: 'speed',
        recommendation: `${highSpeedRoutes.length} routes were operated at speeds 20%+ above average. Consider reducing speed on similar routes to improve fuel efficiency.`,
        impact: 'medium'
      });
    }
  }

  const routeTypeCounts = {};

  routes.forEach(route => {
    const routeType = route.routeType || 'standard';
    routeTypeCounts[routeType] = (routeTypeCounts[routeType] || 0) + 1;
  });

  if (routeTypeCounts['fuel-optimized'] && routeTypeCounts['fuel-optimized'] < routes.length * 0.3) {
    recommendations.push({
      category: 'route-strategy',
      recommendation: 'Consider increasing use of fuel-optimized routes for better efficiency.',
      impact: 'medium'
    });
  }

  if (routeTypeCounts['hybrid'] && routeTypeCounts['hybrid'] >= 3) {
    const hybridRoutes = routes.filter(route => route.routeType === 'hybrid');
    const otherRoutes = routes.filter(route => route.routeType !== 'hybrid');

    if (hybridRoutes.length > 0 && otherRoutes.length > 0) {
      const hybridAvgDuration = hybridRoutes.reduce((sum, route) => sum + (route.timeTaken || route.duration || 0), 0) / hybridRoutes.length;
      const otherAvgDuration = otherRoutes.reduce((sum, route) => sum + (route.timeTaken || route.duration || 0), 0) / otherRoutes.length;

      if (hybridAvgDuration < otherAvgDuration * 0.95) {
        recommendations.push({
          category: 'route-strategy',
          recommendation: 'Hybrid route strategy shows promising results. Consider using it more frequently for optimal balance of speed and efficiency.',
          impact: 'high'
        });
      }
    }
  }

  return recommendations;
}

module.exports = {
  getAnalytics
};