// Minimal API client for talking to the CG Dating backend.
// Base URL comes from VITE_API_URL, falling back to the local dev server.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const TOKEN_KEY = 'cg_dating_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Builds a `?key=value&...` query string, skipping undefined/null/empty
// values so callers can pass a params object without pre-filtering it.
function toQueryString(params = {}) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      usp.set(key, value);
    }
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || `Request failed with status ${res.status}`);
  }

  return data;
}

export function signup(email, password) {
  return request('/api/auth/signup', { method: 'POST', body: { email, password } });
}

export function login(email, password) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

export function getMe() {
  return request('/api/auth/me', { method: 'GET', auth: true });
}

export function getMyProfile() {
  return request('/api/profile/me', { method: 'GET', auth: true });
}

export function saveMyProfile(fields) {
  return request('/api/profile/me', { method: 'PUT', body: fields, auth: true });
}

export function getUserProfile(userId) {
  return request(`/api/profile/${userId}`, { method: 'GET', auth: true });
}

export function addProfilePhoto({ url, imageBase64, mimeType }) {
  return request('/api/profile/me/photos', {
    method: 'POST',
    body: url ? { url } : { imageBase64, mimeType },
    auth: true,
  });
}

// --- Discovery + Matching (Task #4) ---------------------------------------

export function getDiscoveryFeed({ page, limit, datingIntention, city } = {}) {
  return request(`/api/discovery/feed${toQueryString({ page, limit, datingIntention, city })}`, {
    method: 'GET',
    auth: true,
  });
}

export function swipe(toUserId, action) {
  return request('/api/discovery/swipe', {
    method: 'POST',
    body: { toUserId, action },
    auth: true,
  });
}

export function getMatches({ page, limit } = {}) {
  return request(`/api/matches${toQueryString({ page, limit })}`, { method: 'GET', auth: true });
}

// --- Chat (Task #5) --------------------------------------------------------
// REST is the history/send/read-receipt path; real-time delivery is handled
// separately by the Socket.IO client (see frontend/src/socket.js).

// Newest-first, cursor-paginated (`before` = a message id) — see
// docs/API_DOCUMENTATION.md's Messaging section for why.
export function getMessages(matchId, { before, limit } = {}) {
  return request(`/api/matches/${matchId}/messages${toQueryString({ before, limit })}`, {
    method: 'GET',
    auth: true,
  });
}

export function sendMessage(matchId, text) {
  return request(`/api/matches/${matchId}/messages`, {
    method: 'POST',
    body: { text },
    auth: true,
  });
}

export function markMessagesRead(matchId) {
  return request(`/api/matches/${matchId}/messages/read`, {
    method: 'PATCH',
    auth: true,
  });
}

// --- Notifications (Task #6) ------------------------------------------------
// REST is the read/mark-read path; live delivery of new notifications is via
// the shared Socket.IO connection's 'notification:new' event (see
// frontend/src/context/NotificationContext.jsx).

export function getNotifications({ page, limit } = {}) {
  return request(`/api/notifications${toQueryString({ page, limit })}`, {
    method: 'GET',
    auth: true,
  });
}

export function getUnreadNotificationCount() {
  return request('/api/notifications/unread-count', { method: 'GET', auth: true });
}

export function markNotificationRead(id) {
  return request(`/api/notifications/${id}/read`, { method: 'PATCH', auth: true });
}

export function markAllNotificationsRead() {
  return request('/api/notifications/read-all', { method: 'PATCH', auth: true });
}

export function getNotificationPreferences() {
  return request('/api/notifications/preferences', { method: 'GET', auth: true });
}

export function updateNotificationPreferences(prefs) {
  return request('/api/notifications/preferences', { method: 'PUT', body: prefs, auth: true });
}

// --- Verification (Task #9 in the internal TaskList; = docs/ROADMAP.md's
// Phase 7) ------------------------------------------------------------------

export function requestMobileOtp(phone) {
  return request('/api/verification/mobile/request-otp', {
    method: 'POST',
    body: phone !== undefined ? { phone } : {},
    auth: true,
  });
}

export function verifyMobileOtp(otp) {
  return request('/api/verification/mobile/verify-otp', {
    method: 'POST',
    body: { otp },
    auth: true,
  });
}

export function submitPhotoVerification({ url, imageBase64, mimeType }) {
  return request('/api/verification/photo/submit', {
    method: 'POST',
    body: url ? { url } : { imageBase64, mimeType },
    auth: true,
  });
}

export function getVerificationStatus() {
  return request('/api/verification/status', { method: 'GET', auth: true });
}
