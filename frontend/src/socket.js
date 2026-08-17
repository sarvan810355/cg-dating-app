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
// `autoConnect: false` — callers explicitly connect when needed.
// Task #6 update: NotificationContext (frontend/src/context/
// NotificationContext.jsx) is now what connects this for the whole
// authenticated session (so live 'notification:new' delivery works from any
// screen, not just an open chat) and AuthContext's logout() is what
// disconnects it; Chat.jsx still connects it too (defensively, in case a
// chat is opened before NotificationContext's effect runs) but no longer
// disconnects it on unmount — see Chat.jsx's comment.
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
