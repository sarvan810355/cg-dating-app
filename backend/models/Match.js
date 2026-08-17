const mongoose = require('mongoose');

// A mutual like between two users (created once both sides have swiped right).
const MatchSchema = new mongoose.Schema(
  {
    users: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: 'A match must contain exactly two users.',
      },
    },
    matchedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', MatchSchema);
