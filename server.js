const express = require('express');
const app = express();
const dotenv = require('dotenv');
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined');
  process.exit(1);
}

const { connectDB } = require('./config/db');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/', require('./routes/index'));

const startServer = async () => {
  try {
    await connectDB();

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();