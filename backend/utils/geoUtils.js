// Pure, DB-independent geo helpers for Task #14 (location/age match
// preferences, V2, user-requested). Kept separate from the Profile model /
// discovery route so distance math and the city-approximation fallback can
// be unit-tested with plain Node scripts, without a live MongoDB connection —
// same convention already established by backend/utils/matchUtils.js /
// backend/utils/safeDateUtils.js.

const { CG_CITY_COORDINATES } = require('../constants/cgLocationOptions');

const EARTH_RADIUS_KM = 6371;

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

// Looks up an approximate [lng, lat] for a profile's city/district using the
// static CG_CITY_COORDINATES table (see backend/constants/cgLocationOptions.js
// for why this exists — no geocoding API key is configured for this
// project). Tries `city` first (more specific), then falls back to
// `district`. Returns null if neither matches — callers must treat that as
// "no approximate location available", not an error.
function resolveApproxCoordinates(city, district) {
  const cityKey = normalizeKey(city);
  if (cityKey && CG_CITY_COORDINATES[cityKey]) {
    return CG_CITY_COORDINATES[cityKey];
  }
  const districtKey = normalizeKey(district);
  if (districtKey && CG_CITY_COORDINATES[districtKey]) {
    return CG_CITY_COORDINATES[districtKey];
  }
  return null;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle distance in km between two [lng, lat] points (GeoJSON
// coordinate order, matching Profile.location). Returns null if either
// coordinate pair is missing/malformed — callers must treat that as "unknown
// distance", never throw.
function haversineDistanceKm(coordsA, coordsB) {
  if (
    !Array.isArray(coordsA) ||
    !Array.isArray(coordsB) ||
    coordsA.length !== 2 ||
    coordsB.length !== 2 ||
    !coordsA.every(Number.isFinite) ||
    !coordsB.every(Number.isFinite)
  ) {
    return null;
  }
  const [lng1, lat1] = coordsA;
  const [lng2, lat2] = coordsB;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// Whether a candidate should be INCLUDED under a distance-based preference.
// Deliberately graceful/fail-open on missing data: if either side has no
// resolvable coordinates, distance simply can't be evaluated, and the
// candidate is kept (never excluded for a data gap that isn't their fault) —
// see MOCK_FEATURES.md's Task #14 entry for why "no geocoding API" makes
// this the honest default rather than silently hiding profiles. Returns
// `distanceKm: null` in that case so callers/response payloads can be
// transparent about not knowing.
function isWithinDistance(myCoords, candidateCoords, maxDistanceKm) {
  const distanceKm = haversineDistanceKm(myCoords, candidateCoords);
  if (distanceKm === null) {
    return { withinDistance: true, distanceKm: null };
  }
  return { withinDistance: distanceKm <= maxDistanceKm, distanceKm };
}

module.exports = {
  EARTH_RADIUS_KM,
  resolveApproxCoordinates,
  haversineDistanceKm,
  isWithinDistance,
};
