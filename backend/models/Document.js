const mongoose = require('mongoose');

const documentSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    filename: {
      type: String,
      required: true,
    },
    pineconeNamespace: {
      type: String,
      required: true, // Unique namespace/ID for this document's vectors
    },
    summary: {
      type: String,
      default: '', // Stores a generated summary of the document
    },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },
    storagePath: {
      type: String, // Path to physical PDF file on disk
    },
  },
  {
    timestamps: true,
  }
);

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
