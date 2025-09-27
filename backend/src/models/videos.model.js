import mongoose from 'mongoose';
import {VIDEO_STATUS} from "../utils/constant.js"

const videoSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true, 
    maxlength: 200 
  },
  description: { 
    type: String, 
    trim: true, 
    maxlength: 1000, 
    default: '' 
  },
  path: { 
    type: String, 
    select: false 
  },
  cloudinaryPublicId: { 
    type: String 
  },
  cloudinaryUrl: { 
    type: String 
  },
  fileSize: { 
    type: Number, 
    min: 0, 
    max: 500*1024*1024 
  },
  mimeType: { 
    type: String 
  },
  transcript: { 
    type: String 
  },
  summary: {
    type: String
  },
  keyPoints: [{
    type: String
  }],
  language: {
    type: String,
    default: 'english'
  },
  embeddings: { 
    type: [Number], 
    default: undefined 
  },
  status: { 
    type: String, 
    enum: Object.values(VIDEO_STATUS), 
    default: VIDEO_STATUS.QUEUED, 
    index: true 
  },
  userId: { 
    type: String, 
    required: true, 
    index: true 
  },
  uploadedAt: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
  processedAt: { 
    type: Date 
  },
  error: { 
    type: String, 
    maxlength: 500 
  },
}, { 
  timestamps: true, 
  toJSON: { 
    virtuals: true, 
    transform: (_doc, ret) => { 
      delete ret.path; 
      delete ret.__v; 
      return ret; 
    }
  }
});

// Virtual url mirrors cloudinaryUrl for frontend compatibility
videoSchema.virtual('url').get(function() {
  return this.cloudinaryUrl;
});

// Indexes for better query performance
videoSchema.index({ userId: 1, uploadedAt: -1 });
videoSchema.index({ userId: 1, status: 1 });
videoSchema.index({ createdAt: -1 });

export default mongoose.model('Video', videoSchema);