// Shared blocking-effect helpers for Task #10 (Safety — Report/Block, see
// docs/ROADMAP.md's Phase 8). Centralized here so the discovery feed
// (backend/routes/discovery.js), the matches list + messaging authorization
// (backend/routes/matches.js), and the Socket.IO match:join handler
// (backend/socket.js) all apply the exact same "bidirectional exclusion"
// rule from one place instead of each re-deriving it slightly differently.

const Block = require('../models/Block');

// Returns the set (as string user ids) of every user that should be
// excluded from `userId`'s view due to blocking, in EITHER direction: users
// `userId` has blocked, and users who have blocked `userId`. This is the
// literal "don't show someone who blocked me, don't show someone I blocked"
// rule from the Task #10 spec, applied identically everywhere it's needed
// (discovery feed candidates, matches list).
async function getBlockedUserIds(userId) {
  const [blockedByMe, blockedMe] = await Promise.all([
    Block.find({ blocker: userId }).distinct('blocked'),
    Block.find({ blocked: userId }).distinct('blocker'),
  ]);
  return new Set([...blockedByMe, ...blockedMe].map(String));
}

// Whether a block exists between the two users, in either direction — the
// actual safety check for "can these two people message each other". Used
// by backend/routes/matches.js's loadAuthorizedMatch() (gates
// GET/POST/PATCH on a match's messages) and backend/socket.js's match:join
// handler (gates joining a match's real-time room), so a block can never be
// bypassed via one path just because it was closed off on the other.
async function isBlockedEitherWay(userIdA, userIdB) {
  if (!userIdA || !userIdB) return false;
  const block = await Block.findOne({
    $or: [
      { blocker: userIdA, blocked: userIdB },
      { blocker: userIdB, blocked: userIdA },
    ],
  }).select('_id');
  return !!block;
}

module.exports = { getBlockedUserIds, isBlockedEitherWay };
