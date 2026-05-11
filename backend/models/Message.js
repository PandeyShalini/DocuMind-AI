const mongoose = require('mongoose');

const messageSchema = mongoose.Schema(
  {
    chatSession: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'ChatSession',
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    sources: [
      {
        page: Number,
        text: String,
      }
    ],
  },
  {
    timestamps: true,
  }
);

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
