// MOCK/TEMPORARY: no Cloudinary integration configured yet (no credentials —
// see MOCK_FEATURES.md). This mirrors the exact same mock photo-storage
// pattern first established for profile photos
// (backend/routes/profile.js's `POST /api/profile/me/photos`) — accepts
// either a real external `url` (or an already-formed `data:` URI), or raw
// `imageBase64` (+ optional `mimeType`) which gets wrapped into a `data:`
// URI and stored directly on the document. No file ever goes to disk or any
// object store. Pulled out into its own shared helper so
// backend/routes/verification.js's selfie-submission endpoint doesn't have
// to duplicate the validation inline — see MOCK_FEATURES.md for the
// Cloudinary migration note that applies to both call sites.

const URL_RE = /^https?:\/\/\S+$/i;
const DATA_URI_RE = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
// ~7MB of base64 text decodes to roughly 5MB of binary — same generous cap
// used for profile photos, not a real production upload limit.
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Returns { url } on success, or { error } on validation failure.
function resolveMockImageUrl({ url, imageBase64, mimeType } = {}) {
  if (url) {
    const trimmed = String(url).trim();
    if (!URL_RE.test(trimmed) && !DATA_URI_RE.test(trimmed)) {
      return { error: 'url must be a valid http(s) URL or image data URI' };
    }
    return { url: trimmed };
  }

  if (imageBase64) {
    const type = ALLOWED_MIME_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';
    if (String(imageBase64).length > MAX_BASE64_LENGTH) {
      return { error: 'Image is too large' };
    }
    return { url: `data:${type};base64,${imageBase64}` };
  }

  return { error: 'Provide either url or imageBase64' };
}

module.exports = { resolveMockImageUrl, URL_RE, DATA_URI_RE, MAX_BASE64_LENGTH, ALLOWED_MIME_TYPES };
