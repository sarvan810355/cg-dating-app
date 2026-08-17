const jwt = require('jsonwebtoken');

// Single place that knows how to verify our JWTs (secret + algorithm
// handling lives here only). Reused by both the HTTP `requireAuth`
// middleware below and the Socket.IO handshake auth (backend/socket.js,
// Task #5 — chat) so the two auth paths can never drift out of sync.
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

// Verifies a `Authorization: Bearer <token>` header and attaches the
// decoded payload (currently just { id }) to req.user. Reusable by any
// future protected route (profile, match, chat, ...).
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth, verifyToken };
