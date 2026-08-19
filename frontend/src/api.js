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
    const err = new Error(data.message || `Request failed with status ${res.status}`);
    // Attached so callers that need more than the message string (e.g. the
    // Task #12 daily-like-limit 429's `upgradeRequired` flag, see
    // frontend/src/pages/Discovery.jsx) don't have to regex-match error
    // text — purely additive, existing `err.message`-only callers are
    // unaffected.
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export function signup(email, password, referralCode) {
  return request('/api/auth/signup', {
    method: 'POST',
    body: { email, password, ...(referralCode ? { referralCode } : {}) },
  });
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

// --- Discovery + Matching (Task #4; location/age preferences + query-param
// overrides added in Task #14, V2, user-requested) --------------------------

// `maxDistanceKm`/`minAge`/`maxAge`/`verifiedOnly` are one-off overrides for
// THIS request only (never persisted) — "search wider" UX, see
// frontend/src/pages/Discovery.jsx. Omit them to use the caller's saved
// preferences from `PUT /api/profile/me`'s `preferences` sub-object (see
// updateMatchPreferences() below).
export function getDiscoveryFeed({
  page,
  limit,
  datingIntention,
  city,
  maxDistanceKm,
  minAge,
  maxAge,
  verifiedOnly,
} = {}) {
  return request(
    `/api/discovery/feed${toQueryString({
      page,
      limit,
      datingIntention,
      city,
      maxDistanceKm,
      minAge,
      maxAge,
      verifiedOnly,
    })}`,
    { method: 'GET', auth: true }
  );
}

// Persisted match preferences (Task #14) — a thin, documented wrapper over
// the existing partial-merge PUT /api/profile/me (no new endpoint; see
// docs/API_DOCUMENTATION.md's Discovery section). Pass only the fields being
// changed, e.g. updateMatchPreferences({ maxDistanceKm: 25 }).
export function updateMatchPreferences(preferences) {
  return request('/api/profile/me', { method: 'PUT', body: { preferences }, auth: true });
}

// Private/Incognito browsing (Task #14) — same partial-merge pattern.
export function updatePrivacySettings(privacySettings) {
  return request('/api/profile/me', { method: 'PUT', body: { privacySettings }, auth: true });
}

// Real device-coordinate capture (Task #14) — explicit user consent via the
// browser geolocation API (frontend/src/pages/ProfileBuilder.jsx's "Use my
// current location" button). Same partial-merge PUT /api/profile/me.
export function updateProfileLocation(latitude, longitude) {
  return request('/api/profile/me', { method: 'PUT', body: { latitude, longitude }, auth: true });
}

// `priority` (Task #16 — Priority Like, V2 scope) is only meaningful
// alongside `action: 'like'` — omit it (or pass `false`) for an ordinary
// swipe, exactly as before this task; every existing call site keeps
// working unchanged.
export function swipe(toUserId, action, priority) {
  return request('/api/discovery/swipe', {
    method: 'POST',
    body: { toUserId, action, ...(priority ? { priority: true } : {}) },
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

// --- Smart Icebreakers + Why-You-Match (Task #15, V2, user-requested) -----
// Both are deterministic, heuristic profile-comparison endpoints — NOT a
// real AI/LLM call (no ANTHROPIC_API_KEY configured in this project). See
// backend/utils/compatibilityUtils.js / backend/utils/icebreakerUtils.js
// and MOCK_FEATURES.md.

export function getMatchCompatibility(matchId) {
  return request(`/api/matches/${matchId}/compatibility`, { method: 'GET', auth: true });
}

export function getMatchIcebreakers(matchId) {
  return request(`/api/matches/${matchId}/icebreakers`, { method: 'GET', auth: true });
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

// --- Safety: Report / Block (Task #10 in the internal TaskList; = docs/
// ROADMAP.md's Phase 8) ------------------------------------------------------

export function reportUser(reportedUserId, reason, details) {
  return request('/api/reports', {
    method: 'POST',
    body: { reportedUserId, reason, ...(details ? { details } : {}) },
    auth: true,
  });
}

export function blockUser(blockedUserId) {
  return request('/api/blocks', { method: 'POST', body: { blockedUserId }, auth: true });
}

export function unblockUser(userId) {
  return request(`/api/blocks/${userId}`, { method: 'DELETE', auth: true });
}

export function getBlockedUsers() {
  return request('/api/blocks', { method: 'GET', auth: true });
}

// --- Subscription (Task #12 in the internal TaskList — Subscription
// scaffolding). POST /subscribe is a MOCK checkout — see
// backend/routes/subscription.js's route-level comment and
// MOCK_FEATURES.md; no real payment form is involved. --------------------

export function getPlans() {
  return request('/api/plans', { method: 'GET' });
}

export function getMySubscription() {
  return request('/api/subscription/me', { method: 'GET', auth: true });
}

export function subscribeToPlan(planCode) {
  return request('/api/subscription/subscribe', {
    method: 'POST',
    body: { planCode },
    auth: true,
  });
}

export function cancelSubscription() {
  return request('/api/subscription/cancel', { method: 'POST', auth: true });
}

// --- Admin panel (Task #11 in the internal TaskList; = docs/ROADMAP.md's
// Phase 9). All routes require the caller's role to be ADMIN/SUPER_ADMIN/
// MODERATOR (see backend/middleware/adminAuth.js) — a non-admin caller gets
// a 403 from every one of these; the frontend's role gate
// (frontend/src/components/AdminRoute.jsx) keeps non-admins from ever
// reaching a screen that would call them. --------------------------------

export function getAdminDashboard() {
  return request('/api/admin/dashboard', { method: 'GET', auth: true });
}

export function getAdminReports({ status, page, limit } = {}) {
  return request(`/api/admin/reports${toQueryString({ status, page, limit })}`, {
    method: 'GET',
    auth: true,
  });
}

export function reviewAdminReport(id, { status, reviewNotes } = {}) {
  return request(`/api/admin/reports/${id}`, {
    method: 'PATCH',
    body: { status, ...(reviewNotes !== undefined ? { reviewNotes } : {}) },
    auth: true,
  });
}

export function getAdminPhotoVerifications({ status, page, limit } = {}) {
  return request(`/api/admin/verifications/photo${toQueryString({ status, page, limit })}`, {
    method: 'GET',
    auth: true,
  });
}

export function reviewAdminPhotoVerification(userId, status) {
  return request(`/api/admin/verifications/photo/${userId}`, {
    method: 'PATCH',
    body: { status },
    auth: true,
  });
}

export function getAdminUsers({ email, page, limit } = {}) {
  return request(`/api/admin/users${toQueryString({ email, page, limit })}`, {
    method: 'GET',
    auth: true,
  });
}

export function suspendAdminUser(userId) {
  return request(`/api/admin/users/${userId}/suspend`, { method: 'PATCH', auth: true });
}

export function reinstateAdminUser(userId) {
  return request(`/api/admin/users/${userId}/reinstate`, { method: 'PATCH', auth: true });
}

// --- Referral program (Task #17 — "Invite & Earn", V2 scope, see
// docs/BUSINESS_PLAN.md's Growth Strategy). ---------------------------------

export function getMyReferrals() {
  return request('/api/referrals/me', { method: 'GET', auth: true });
}

// --- Safe Date mode + Date Planner (Task #18 — V2, see docs/ROADMAP.md's Phase 12).
// "Missed check-in" / the pre-date reminder are both computed at READ time by the
// backend (no scheduler exists in this project) — see docs/API_DOCUMENTATION.md's
// Safe Date section and MOCK_FEATURES.md, and note `isOverdue`/`isReminderWindow` on
// every SafeDate object below are exactly that computed state, refreshed on every GET.

export function createSafeDate(fields) {
  return request('/api/safe-dates', { method: 'POST', body: fields, auth: true });
}

export function getSafeDates({ page, limit, status } = {}) {
  return request(`/api/safe-dates${toQueryString({ page, limit, status })}`, {
    method: 'GET',
    auth: true,
  });
}

export function getSafeDate(id) {
  return request(`/api/safe-dates/${id}`, { method: 'GET', auth: true });
}

export function checkInSafeDate(id) {
  return request(`/api/safe-dates/${id}/check-in`, { method: 'PATCH', auth: true });
}

export function completeSafeDate(id) {
  return request(`/api/safe-dates/${id}/complete`, { method: 'PATCH', auth: true });
}

export function cancelSafeDate(id) {
  return request(`/api/safe-dates/${id}/cancel`, { method: 'PATCH', auth: true });
}

// Date Planner — a stateless, curated suggestion generator (NOT real AI, no
// ANTHROPIC_API_KEY configured — same constraint already documented for Task #15's
// Icebreakers/Why-You-Match). Nothing is persisted; see
// backend/utils/datePlanUtils.js.
export function getDateIdeas({ budget, activityType, city } = {}) {
  return request(`/api/date-ideas${toQueryString({ budget, activityType, city })}`, {
    method: 'GET',
    auth: true,
  });
}

// --- Profile Boost + Priority Like (Task #16 — V2 scope, see
// docs/API_DOCUMENTATION.md's Boost section). Priority Like itself has no
// dedicated function here — it's the `priority` argument on swipe() above. --

export function getBoostStatus() {
  return request('/api/boosts/status', { method: 'GET', auth: true });
}

export function activateBoost() {
  return request('/api/boosts/activate', { method: 'POST', auth: true });
}

// --- Achievements/Badges + Weekly Recap (Task #20, V2, user-requested — see
// docs/BUSINESS_PLAN.md's Brand personality section: built as the
// deliberately non-manipulative alternative to an original "make it
// addictive" request. See backend/constants/badgeOptions.js /
// backend/utils/weeklyRecapUtils.js.) --------------------------------------

export function getBadges() {
  return request('/api/badges', { method: 'GET', auth: true });
}

export function getWeeklyRecap() {
  return request('/api/recap/weekly', { method: 'GET', auth: true });
}

export function markWeeklyRecapSeen() {
  return request('/api/recap/weekly/seen', { method: 'PATCH', auth: true });
}
