require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const healthRouter = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cg-dating-app';

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRouter);

app.get('/', (req, res) => {
  res.json({ message: 'CG Dating API' });
});

// Attempt to connect to MongoDB, but don't crash the process if it's not
// reachable yet (e.g. during local scaffolding before Mongo is running).
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    console.warn('Continuing without a database connection.');
  });

app.listen(PORT, () => {
  console.log(`CG Dating backend listening on port ${PORT}`);
});

module.exports = app;
