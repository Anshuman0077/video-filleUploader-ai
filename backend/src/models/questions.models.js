import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  answer: {
    type: String,
    required: true
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  language: {
    type: String,
    default: 'english'
  },
  askedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index for better query performance
questionSchema.index({ videoId: 1, askedAt: -1 });
questionSchema.index({ userId: 1, askedAt: -1 });

export default mongoose.model('Question', questionSchema);