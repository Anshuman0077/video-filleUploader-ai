import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
    validate: {
      validator: function(question) {
        return question && question.trim().length > 0;
      },
      message: 'Question cannot be empty or whitespace only'
    }
  },
  answer: {
    type: String,
    required: true,
    validate: {
      validator: function(answer) {
        return answer && answer.trim().length > 0;
      },
      message: 'Answer cannot be empty or whitespace only'
    }
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true,
    index: true,
    validate: {
      validator: function(videoId) {
        return mongoose.Types.ObjectId.isValid(videoId);
      },
      message: 'Invalid video ID format'
    }
  },
  userId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function(userId) {
        return userId && typeof userId === 'string' && userId.length >= 5;
      },
      message: 'User ID must be a valid string'
    }
  },
  language: {
    type: String,
    default: 'english',
    enum: {
      values: ['english', 'spanish', 'french', 'german', 'hindi', 'chinese'],
      message: 'Language {VALUE} is not supported'
    },
    validate: {
      validator: function(language) {
        return ['english', 'spanish', 'french', 'german', 'hindi', 'chinese'].includes(language);
      },
      message: 'Invalid language specified'
    }
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
    validate: {
      validator: function(confidence) {
        return confidence >= 0 && confidence <= 100;
      },
      message: 'Confidence must be between 0 and 100'
    }
  },
  relevantChunks: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: function(chunks) {
        return chunks >= 0;
      },
      message: 'Relevant chunks cannot be negative'
    }
  },
  askedAt: {
    type: Date,
    default: Date.now,
    index: true,
    validate: {
      validator: function(date) {
        return date instanceof Date && !isNaN(date.getTime());
      },
      message: 'Invalid date format'
    }
  },
  processingTime: {
    type: Number,
    min: 0,
    validate: {
      validator: function(time) {
        return time >= 0;
      },
      message: 'Processing time cannot be negative'
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Compound indexes for better query performance
questionSchema.index({ videoId: 1, askedAt: -1 });
questionSchema.index({ userId: 1, askedAt: -1 });
questionSchema.index({ videoId: 1, userId: 1 });
questionSchema.index({ askedAt: -1 });

// Text index for search functionality
questionSchema.index({
  question: 'text',
  answer: 'text'
}, {
  weights: {
    question: 10,
    answer: 5
  },
  name: 'question_text_search'
});

// Static method to find questions by video with pagination
questionSchema.statics.findByVideo = function(videoId, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = 'askedAt',
    sortOrder = 'desc'
  } = options;

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  return this.find({ videoId })
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
};

// Static method to get question statistics for a video
questionSchema.statics.getVideoStats = function(videoId) {
  return this.aggregate([
    { $match: { videoId: new mongoose.Types.ObjectId(videoId) } },
    {
      $group: {
        _id: '$videoId',
        totalQuestions: { $sum: 1 },
        avgConfidence: { $avg: '$confidence' },
        avgProcessingTime: { $avg: '$processingTime' },
        languages: { $addToSet: '$language' }
      }
    }
  ]);
};

// Instance method to check if question is recent
questionSchema.methods.isRecent = function(hours = 24) {
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.askedAt >= cutoffTime;
};

// Pre-save middleware for validation
questionSchema.pre('save', function(next) {
  // Ensure askedAt is set on new documents
  if (this.isNew && !this.askedAt) {
    this.askedAt = new Date();
  }

  // Calculate processing time if not set
  if (this.isModified('answer') && !this.processingTime) {
    this.processingTime = new Date() - this.askedAt;
  }

  // Validate that answer exists if question is set
  if (this.question && !this.answer) {
    return next(new Error('Answer is required when question is provided'));
  }

  next();
});

// Post-save middleware
questionSchema.post('save', function(doc, next) {
  console.log(`Question ${doc._id} saved for video ${doc.videoId}`);
  next();
});

export default mongoose.model('Question', questionSchema);