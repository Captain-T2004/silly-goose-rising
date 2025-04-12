const axios = require('axios');
const NodeCache = require('node-cache');

const weatherCache = new NodeCache({ stdTTL: 3600 });

class WeatherService {
  constructor() {
    this.apiKey = process.env.OPENWEATHER_API_KEY;
    this.baseUrl = 'https://api.openweathermap.org/data/2.5';
  }

  async getCurrentWeather(lat, lon) {
    const cacheKey = `current_${lat}_${lon}`;
    const cachedData = weatherCache.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/weather`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'metric'
        }
      });

      weatherCache.set(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching current weather:', error);
      throw new Error('Failed to fetch weather data');
    }
  }

  async getForecast(lat, lon) {
    const cacheKey = `forecast_${lat}_${lon}`;
    const cachedData = weatherCache.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/forecast`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'metric'
        }
      });

      weatherCache.set(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching weather forecast:', error);
      throw new Error('Failed to fetch forecast data');
    }
  }

  async getMarineWeather(lat, lon) {
    const cacheKey = `marine_${lat}_${lon}`;
    const cachedData = weatherCache.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/marine`, {
        params: {
          lat,
          lon,
          appid: this.apiKey
        }
      });

      weatherCache.set(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching marine weather:', error);
      throw new Error('Failed to fetch marine weather data');
    }
  }

  async getRouteWeather(waypoints, startDate, endDate) {
    try {
      const weatherData = [];

      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      for (const point of waypoints) {
        const forecast = await this.getForecast(point.lat, point.lon);
        weatherData.push({
          location: point,
          forecast: forecast.list.filter(item => {
            const forecastDate = new Date(item.dt * 1000);
            return forecastDate >= startDate && forecastDate <= endDate;
          })
        });
      }

      return weatherData;
    } catch (error) {
      console.error('Error fetching route weather:', error);
      throw new Error('Failed to fetch weather data for route');
    }
  }

  async getCriticalConditions(route, startDate, endDate) {
    try {
      const criticalConditions = [];

      for (const point of route) {
        const forecast = await this.getForecast(point.lat, point.lon);

        const relevantForecasts = forecast.list.filter(item => {
          const forecastDate = new Date(item.dt * 1000);
          return forecastDate >= startDate && forecastDate <= endDate;
        });

        for (const item of relevantForecasts) {
          const windSpeed = item.wind.speed;
          const waveHeight = item.main?.sea_level ? (item.main.sea_level / 100) : null;

          if (windSpeed > 15 || (waveHeight && waveHeight > 3)) {
            criticalConditions.push({
              location: point,
              time: new Date(item.dt * 1000),
              conditions: {
                windSpeed,
                waveHeight,
                temp: item.main.temp,
                weather: item.weather[0].main,
                description: item.weather[0].description
              }
            });
          }
        }
      }

      return criticalConditions;
    } catch (error) {
      console.error('Error checking critical conditions:', error);
      throw new Error('Failed to check for critical weather conditions');
    }
  }
}

module.exports = new WeatherService();