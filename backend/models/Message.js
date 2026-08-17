const mongoose = require('mongoose');

// A single chat message exchanged between two matched users.
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
      trim: true,
    },
    readAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', MessageSchema);
