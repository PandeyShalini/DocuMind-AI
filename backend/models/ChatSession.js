const mongoose = require('mongoose');

const chatSessionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    document: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: 'Document',
    },
    title: {
      type: String,
      required: true,
      default: 'New Chat',
    },
  },
  {
    timestamps: true,
  }
);

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

module.exports = ChatSession;
