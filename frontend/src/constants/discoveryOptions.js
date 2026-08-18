// Mirrors backend/constants/discoveryOptions.js's Task #14 additions
// (location/age match preferences, V2, user-requested). Kept as a separate
// copy since frontend and backend are independent npm packages — see
// frontend/src/constants/profileOptions.js's header comment for the same
// convention.

export const DEFAULT_MAX_DISTANCE_KM = 50;
export const MAX_DISTANCE_KM_CAP = 500;
export const DEFAULT_MIN_AGE_PREF = 18;
export const DEFAULT_MAX_AGE_PREF = 45;
export const MAX_AGE_PREF_CAP = 100;
