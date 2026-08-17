const mongoose = require('mongoose');
const { MAX_MESSAGE_LENGTH } = require('../constants/chatOptions');

// A single chat message exchanged between two matched users, fleshed out for
// Task #5 (Chat) from the earlier placeholder. `match` doubles as the
// conversation identifier — see the `conversations` divergence note in
// docs/DATABASE_SCHEMA.md: a Match already uniquely identifies the two
// participants of a conversation, so there is no separate Conversation
// collection; messages are simply queried by `match`.
//
// `recipient` (the other participant, derived server-side from the match at
// send time — see backend/utils/matchUtils.js's otherParticipant()) is kept
// as its own field, not in the original minimal draft ({ match, sender,
// text, createdAt, readAt }), purely so "mark all messages sent *to* me in
// this match as read" (PATCH /api/matches/:matchId/messages/read) is a
// single indexed query instead of re-deriving "the other user" per message.
const MessageSchema = new mongoose.Schema(
  {
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: [true, 'Message text is required'],
      trim: true,
      minlength: [1, 'Message text cannot be empty'],
      maxlength: [
        MAX_MESSAGE_LENGTH,
        `Message text cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      ],
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Supports the actual access pattern for chat history: paginated messages
// for one match, newest (or oldest) first, without a collection scan.
MessageSchema.index({ match: 1, createdAt: -1 });
// Supports "mark all unread messages addressed to me in this match as read".
MessageSchema.index({ match: 1, recipient: 1, readAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);
