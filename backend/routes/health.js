const express = require('express');

const router = express.Router();

// Simple health check endpoint so we have something to hit while the
// real feature routes (auth, profiles, swipe/match, chat) are built out
// in later tasks.
router.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'cg-dating-app-backend' });
});

module.exports = router;
