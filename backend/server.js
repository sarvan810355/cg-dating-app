require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cg-dating-app';

app.use(cors());
// 10mb limit (not just the default ~100kb) to allow the MOCK/TEMPORARY
// base64 photo upload path in POST /api/profile/me/photos until real
// Cloudinary upload is wired up — see MOCK_FEATURES.md.
app.use(express.json({ limit: '10mb' }));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);

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
