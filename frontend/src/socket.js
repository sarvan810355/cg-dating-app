import { io } from 'socket.io-client';
import { getToken } from './api';

// Same base URL the REST client uses.
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

let socket = null;

// Lazily creates (and reuses) a single shared Socket.IO connection for the
// whole app, authenticated with the stored JWT at handshake time (see
// backend/socket.js's io.use(...) auth middleware, which verifies it with
// the same verifyToken() the REST API uses). `auth` is passed as a function
// so a fresh token is read on every (re)connect attempt rather than being
// captured once and going stale after login/logout.
//
// `autoConnect: false` — callers (Chat.jsx) explicitly connect on mount and
// disconnect on unmount, so a chat screen doesn't leave a dangling socket
// open for the lifetime of the whole app.
export function getSocket() {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    autoConnect: false,
    auth: (cb) => cb({ token: getToken() }),
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
