const mongoose = require('mongoose');

// A one-directional "I don't want to see/hear from this person" relationship
// (Task #10 in the internal TaskList; = docs/ROADMAP.md's Phase 8). Blocking
// is NOT automatically mutual — only `blocker` decided this; if the blocked
// user also wants to block back, they create their own separate Block
// document. The *effects* of a block are applied bidirectionally at query
// time wherever it matters (discovery feed exclusion, matches-list
// exclusion, messaging authorization) rather than by mutating any other
// collection — see backend/utils/blockUtils.js, backend/routes/discovery.js,
// and backend/routes/matches.js.
const BlockSchema = new mongoose.Schema(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    blocked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  // Only createdAt is meaningful — a block is a point-in-time decision;
  // unblocking deletes the document (see `DELETE /api/blocks/:userId`)
  // rather than flipping a flag, so there's no "history of past blocks" to
  // track and no `updatedAt`.
  { timestamps: { createdAt: true, updatedAt: false } }
);

// The actual integrity constraint (can't block the same user twice — a
// repeat POST /api/blocks is idempotent, see backend/routes/blocks.js) and
// the lookup used everywhere "who has *this* user blocked" needs checking.
BlockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
// "Who has blocked me" — the other half of the bidirectional exclusion rule
// (backend/utils/blockUtils.js#getBlockedUserIds()) used by the discovery
// feed and matches list.
BlockSchema.index({ blocked: 1 });

module.exports = mongoose.model('Block', BlockSchema);
