// Task #14 — Location/age match preferences (V2, user-requested: "location
// preference ... jaise other dating apps kaam karte hain"). See
// docs/DATABASE_SCHEMA.md's `profiles.location` section and MOCK_FEATURES.md
// for the full writeup of why this table exists.
//
// This project has NO geocoding API key configured anywhere (no Google Maps /
// Mapbox credentials — same "mocked/unconfigured external integration"
// pattern already true of Cloudinary/Razorpay/FCM/SMS, see MOCK_FEATURES.md).
// Real coordinate capture (browser geolocation, with the user's explicit
// permission) is the primary path — see frontend/src/pages/
// ProfileBuilder.jsx's "Use my current location" button and
// backend/routes/profile.js's `latitude`/`longitude` handling, which sets
// `Profile.locationSource = 'device'`.
//
// This table is the FALLBACK for every profile that hasn't granted/has no
// device geolocation: a static, hand-maintained lookup of approximate
// city/district-center coordinates for Chhattisgarh's major towns (per
// docs/BUSINESS_PLAN.md's city list and backend/constants/profileOptions.js's
// CG_DISTRICTS). "Approximate" is the operative word — these are town/district
// CENTER points, not the user's actual location, deliberately (never more
// precise than city/district, matching this codebase's existing "city/
// district only, never exact address" privacy rule already applied to
// `profiles.city`/`district`). A profile whose city/district isn't in this
// table (a small town not listed) simply gets no approximate coordinate —
// distance filtering gracefully skips it rather than guessing or crashing,
// see backend/utils/geoUtils.js#resolveApproxCoordinates().
//
// Coordinates are [lng, lat] to match GeoJSON Point convention
// (backend/models/Profile.js's `location` field), keyed by lowercase,
// trimmed district/city name for lookup. Values are approximate town-center
// coordinates (public geographic knowledge), not surveyed/verified against
// any mapping API.
const CG_CITY_COORDINATES = {
  raipur: [81.6296, 21.2514],
  durg: [81.2849, 21.1904],
  bhilai: [81.3509, 21.1938],
  bilaspur: [82.1409, 22.0797],
  bastar: [82.0198, 19.0748],
  jagdalpur: [82.0198, 19.0748], // Bastar's district HQ, same coordinate
  dhamtari: [81.5497, 20.7072],
  rajnandgaon: [81.0388, 21.0974],
  raigarh: [83.395, 21.8974],
  korba: [82.7501, 22.3595],
  'janjgir-champa': [82.5833, 22.0],
  janjgir: [82.5833, 22.0],
  jashpur: [84.14, 22.8888],
  kanker: [81.4922, 20.2705],
  kabirdham: [81.25, 22.01],
  kawardha: [81.25, 22.01],
  koriya: [82.5667, 23.25],
  baikunthpur: [82.5667, 23.25],
  surguja: [83.195, 23.1197],
  ambikapur: [83.195, 23.1197],
  mahasamund: [82.0986, 21.1092],
  dantewada: [81.3496, 18.8945],
  bijapur: [80.7911, 18.7864],
  narayanpur: [81.25, 19.7167],
  balod: [81.2, 20.73],
  'baloda bazar': [82.1667, 21.6667],
  balrampur: [83.6, 23.6167],
  bemetara: [81.5333, 21.7167],
  gariaband: [82.0667, 20.6333],
  'gaurela-pendra-marwahi': [81.9167, 22.7667],
  pendra: [81.9167, 22.7667],
  kondagaon: [81.665, 19.5975],
  mungeli: [81.6833, 22.0667],
  sukma: [81.66, 18.39],
  surajpur: [82.8667, 23.2167],
  sakti: [82.9667, 22.0333],
  'manendragarh-chirmiri-bharatpur': [82.2, 23.2],
  'mohla-manpur-ambagarh chowki': [80.75, 20.95],
  'sarangarh-bilaigarh': [83.1, 21.6167],
  'khairagarh-chhuikhadan-gandai': [80.9667, 21.4167],
  khairagarh: [80.9667, 21.4167],
};

// Kept for validation/tests: how many distinct approximate coordinates this
// table currently covers.
const CG_CITY_COORDINATES_COUNT = Object.keys(CG_CITY_COORDINATES).length;

module.exports = { CG_CITY_COORDINATES, CG_CITY_COORDINATES_COUNT };
