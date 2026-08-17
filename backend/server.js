require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const discoveryRouter = require('./routes/discovery');
const matchesRouter = require('./routes/matches');
const { initSocket } = require('./socket');

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
app.use('/api/discovery', discoveryRouter);
app.use('/api/matches', matchesRouter);

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

// Socket.IO (Task #5 — Chat) shares the same underlying HTTP server as
// Express rather than listening on a separate port — see backend/socket.js
// for JWT handshake auth + event handlers. The io instance is attached to
// the Express app so route handlers can reach it via req.app.get('io')
// (see backend/routes/matches.js's message routes, which persist via REST
// then broadcast via this same io instance).
const server = http.createServer(app);
const io = initSocket(server);
app.set('io', io);

server.listen(PORT, () => {
  console.log(`CG Dating backend listening on port ${PORT}`);
});

module.exports = app;
