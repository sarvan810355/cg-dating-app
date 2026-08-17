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
