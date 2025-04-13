const express = require('express');
const http = require('http');
const app = express();
const dotenv = require('dotenv');
dotenv.config({ path: './production.env' });

if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined');
  process.exit(1);
}

if (!process.env.OPENWEATHER_API_KEY) {
  console.error('WARNING: OPENWEATHER_API_KEY is not defined. Weather data will not be available.');
}

const { connectDB } = require('./config/db');
const websocketService = require('./services/websocketService');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    return res.status(200).json({});
  }

  next();
});

app.use('/', require('./routes/index'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
  next();
});

const startServer = async () => {
  try {
    await connectDB();
    const server = http.createServer(app);
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      websocketService.initialize(server);
      console.log(`WebSocket server initialized on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

startServer();