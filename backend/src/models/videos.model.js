import mongoose from 'mongoose';
import {VIDEO_STATUS} from "../utils/constant.js"

const videoSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true, 
    maxlength: 200,
    validate: {
      validator: function(title) {
        return title && title.trim().length > 0;
      },
      message: 'Title cannot be empty'
    }
  },
  description: { 
    type: String, 
    trim: true, 
    maxlength: 1000, 
    default: '',
    validate: {
      validator: function(desc) {
        // Allow empty description, but if provided, validate length
        return !desc || desc.length <= 1000;
      },
      message: 'Description must be less than 1000 characters'
    }
  },
  path: { 
    type: String, 
    select: false 
  },
  cloudinaryPublicId: { 
    type: String,
    index: true
  },
  cloudinaryUrl: { 
    type: String,
    validate: {
      validator: function(url) {
        return !url || url.startsWith('https://');
      },
      message: 'Cloudinary URL must be a valid HTTPS URL'
    }
  },
  fileSize: { 
    type: Number, 
    min: 0, 
    max: 500*1024*1024,
    validate: {
      validator: function(size) {
        return size >= 0 && size <= 500*1024*1024;
      },
      message: 'File size must be between 0 and 500MB'
    }
  },
  mimeType: { 
    type: String,
    enum: [
      'video/mp4', 'video/mpeg', 'video/quicktime', 
      'video/x-msvideo', 'video/webm', 'video/x-matroska'
    ]
  },
  transcript: { 
    type: String,
    validate: {
      validator: function(transcript) {
        // Allow empty transcript, but if provided, validate it's a string
        return !transcript || typeof transcript === 'string';
      },
      message: 'Transcript must be a string'
    }
  },
  summary: {
    type: String,
    validate: {
      validator: function(summary) {
        return !summary || typeof summary === 'string';
      },
      message: 'Summary must be a string'
    }
  },
  keyPoints: [{
    type: String,
    validate: {
      validator: function(point) {
        return typeof point === 'string' && point.length > 0;
      },
      message: 'Key points must be non-empty strings'
    }
  }],
  language: {
    type: String,
    default: 'english',
    enum: ['english', 'spanish', 'french', 'german', 'hindi', 'chinese'],
    validate: {
      validator: function(lang) {
        return ['english', 'spanish', 'french', 'german', 'hindi', 'chinese'].includes(lang);
      },
      message: 'Invalid language specified'
    }
  },
  embeddings: { 
    type: [Number], 
    default: undefined,
    validate: {
      validator: function(embeddings) {
        if (!embeddings) return true; // Allow undefined/null
        if (!Array.isArray(embeddings)) return false;
        return embeddings.every(num => typeof num === 'number' && isFinite(num));
      },
      message: 'Embeddings must be an array of numbers'
    }
  },
  status: { 
    type: String, 
    enum: Object.values(VIDEO_STATUS), 
    default: VIDEO_STATUS.QUEUED, 
    index: true,
    validate: {
      validator: function(status) {
        return Object.values(VIDEO_STATUS).includes(status);
      },
      message: 'Invalid status value'
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
  uploadedAt: { 
    type: Date, 
    default: Date.now, 
    index: true,
    validate: {
      validator: function(date) {
        return date instanceof Date && !isNaN(date.getTime());
      },
      message: 'Upload date must be a valid date'
    }
  },
  processedAt: { 
    type: Date,
    validate: {
      validator: function(date) {
        if (!date) return true; // Allow null/undefined
        return date instanceof Date && !isNaN(date.getTime());
      },
      message: 'Processed date must be a valid date'
    }
  },
  error: { 
    type: String, 
    maxlength: 500,
    validate: {
      validator: function(error) {
        return !error || (typeof error === 'string' && error.length <= 500);
      },
      message: 'Error message must be less than 500 characters'
    }
  },
}, { 
  timestamps: true, 
  toJSON: { 
    virtuals: true, 
    transform: (_doc, ret) => { 
      delete ret.path; 
      delete ret.__v; 
      delete ret.embeddings; // Don't expose embeddings by default
      return ret; 
    }
  },
  toObject: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.path;
      delete ret.__v;
      delete ret.embeddings;
      return ret;
    }
  }
});

// Virtual url mirrors cloudinaryUrl for frontend compatibility
videoSchema.virtual('url').get(function() {
  return this.cloudinaryUrl;
});

// Virtual for processing duration
videoSchema.virtual('processingDuration').get(function() {
  if (this.uploadedAt && this.processedAt) {
    return this.processedAt - this.uploadedAt;
  }
  return null;
});

// Instance method to check if video is processable
videoSchema.methods.isProcessable = function() {
  return this.status === VIDEO_STATUS.QUEUED || this.status === VIDEO_STATUS.PROCESSING;
};

// Static method to find videos by user with pagination
videoSchema.statics.findByUser = function(userId, options = {}) {
  const {
    page = 1,
    limit = 10,
    status,
    search,
    sortBy = 'uploadedAt',
    sortOrder = 'desc'
  } = options;

  const query = { userId };
  
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  return this.find(query)
    .select('-path -__v -embeddings')
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });
};

// Static method to get video statistics for a user
videoSchema.statics.getUserStats = function(userId) {
  return this.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
        avgDuration: { $avg: '$duration' }
      }
    }
  ]);
};

// Compound indexes for better query performance
videoSchema.index({ userId: 1, uploadedAt: -1 }); // For user's recent videos
videoSchema.index({ userId: 1, status: 1, uploadedAt: -1 }); // For filtering by status
videoSchema.index({ cloudinaryPublicId: 1 }); // For quick lookups by Cloudinary ID
videoSchema.index({ 'updatedAt': 1 }); // For cleanup operations

// Text index for search functionality
videoSchema.index({ 
  title: 'text', 
  description: 'text',
  transcript: 'text'
}, {
  weights: {
    title: 10,
    description: 5,
    transcript: 1
  },
  name: 'video_text_search'
});

// Pre-save middleware for validation
videoSchema.pre('save', function(next) {
  // Ensure uploadedAt is set on new documents
  if (this.isNew && !this.uploadedAt) {
    this.uploadedAt = new Date();
  }

  // Set processedAt when status changes to completed or failed
  if (this.isModified('status') && 
      (this.status === VIDEO_STATUS.COMPLETED || this.status === VIDEO_STATUS.FAILED) &&
      !this.processedAt) {
    this.processedAt = new Date();
  }

  // Validate that processedAt is after uploadedAt if both exist
  if (this.uploadedAt && this.processedAt && this.processedAt < this.uploadedAt) {
    return next(new Error('Processed date cannot be before upload date'));
  }

  next();
});

// Post-save middleware for cleanup
videoSchema.post('save', function(doc, next) {
  console.log(`Video ${doc._id} saved with status: ${doc.status}`);
  next();
});

export default mongoose.model('Video', videoSchema);