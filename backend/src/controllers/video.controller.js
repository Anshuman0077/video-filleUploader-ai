import Video from "../models/videos.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { processVideoQueue } from "../queues/video.queue.js";
import { TEMP_DIR, cleanupTempFile } from "../middleware/upload.middleware.js";
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

// Input validation helper
const validateVideoInput = (title, description) => {
  const errors = [];
  
  if (!title || title.trim().length === 0) {
    errors.push('Title is required');
  }
  
  if (title && title.length > 200) {
    errors.push('Title must be less than 200 characters');
  }
  
  if (description && description.length > 1000) {
    errors.push('Description must be less than 1000 characters');
  }
  
  // Validate title doesn't contain malicious content
  const maliciousPattern = /[<>$`|&;]/;
  if (maliciousPattern.test(title)) {
    errors.push('Title contains invalid characters');
  }
  
  if (description && maliciousPattern.test(description)) {
    errors.push('Description contains invalid characters');
  }
  
  return errors;
};

// File validation helper
const validateVideoFile = (file) => {
  const errors = [];
  
  if (!file) {
    errors.push('No video file uploaded');
    return errors;
  }
  
  // Check file size (500MB limit)
  const maxSize = 500 * 1024 * 1024;
  if (file.size > maxSize) {
    errors.push(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
  }
  
  // Check MIME type
  const allowedMimeTypes = [
    'video/mp4', 'video/mpeg', 'video/quicktime', 
    'video/x-msvideo', 'video/webm', 'video/x-matroska'
  ];
  
  if (!allowedMimeTypes.includes(file.mimetype)) {
    errors.push('Invalid file type. Supported formats: MP4, MPEG, MOV, AVI, WebM, MKV');
  }
  
  // Check file extension
  const allowedExtensions = ['.mp4', '.mpeg', '.mov', '.avi', '.webm', '.mkv'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    errors.push('Invalid file extension');
  }
  
  return errors;
};

// Upload video
const uploadVideo = async (req, res) => {
  let tempFile = req.file?.path;

  try {
    const { title, description, language = 'english' } = req.body;

    // Input validation
    const inputErrors = validateVideoInput(title, description);
    if (inputErrors.length > 0) {
      if (tempFile) {
        cleanupTempFile(tempFile);
      }
      return res.status(400).json({
        message: 'Validation failed',
        errors: inputErrors
      });
    }

    // File validation
    const fileErrors = validateVideoFile(req.file);
    if (fileErrors.length > 0) {
      if (tempFile) {
        cleanupTempFile(tempFile);
      }
      return res.status(400).json({
        message: 'File validation failed',
        errors: fileErrors
      });
    }

    const uploadedFilePath = path.resolve(req.file.path);
    
    // Enhanced path traversal protection
    if (!uploadedFilePath.startsWith(path.resolve(TEMP_DIR))) {
      await fs.promises.unlink(uploadedFilePath).catch(() => { });
      return res.status(400).json({ 
        message: 'Invalid file path',
        code: 'PATH_TRAVERSAL'
      });
    }

    // Upload to Cloudinary
    const cloudinaryResponse = await uploadOnCloudinary(tempFile);
    if (!cloudinaryResponse || !cloudinaryResponse.secure_url) {
      if (tempFile) {
        cleanupTempFile(tempFile);
      }
      return res.status(500).json({ 
        message: 'Failed to upload video to cloud storage',
        code: 'CLOUD_UPLOAD_FAILED'
      });
    }

    // Create video record
    const video = new Video({
      title: title.trim(),
      description: description?.trim() || '',
      userId: req.user.id,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      cloudinaryPublicId: cloudinaryResponse.public_id,
      cloudinaryUrl: cloudinaryResponse.secure_url,
      language: language
    });

    await video.save();

    // Add to processing queue
    await processVideoQueue.add('process-video', { 
      videoId: video._id.toString(),
      cloudinaryUrl: cloudinaryResponse.secure_url,
      language: language
    }, {
      jobId: video._id.toString(), // Use video ID as job ID for idempotency
      attempts: parseInt(process.env.JOB_MAX_ATTEMPTS) || 3,
      timeout: parseInt(process.env.JOB_TIMEOUT_MS) || 1800000
    });
    
    // Emit socket event for real-time update to video room
    const io = req.app.get('socketio');
    if (io) {
      io.to(video._id.toString()).emit('video-uploaded', {
        videoId: video._id.toString(),
        status: 'queued',
        title: video.title,
        timestamp: new Date().toISOString()
      });
    }
    
    tempFile = null;

    res.status(201).json({
      message: 'Video uploaded successfully',
      data: {
        videoId: video._id,
        status: video.status,
        title: video.title,
        cloudinaryUrl: video.cloudinaryUrl
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Cleanup on error
    if (tempFile) {
      cleanupTempFile(tempFile);
    }
    
    res.status(500).json({
      message: 'Upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'UPLOAD_ERROR'
    });
  }
};

// Get user's videos with pagination and filters
const getMyVideos = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

    // Validate status parameter
    const validStatuses = ['queued', 'processing', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid status parameter',
        validStatuses: validStatuses
      });
    }

    // Build query with optional status and search filters
    const query = {
      userId: req.user.id,
      ...(status ? { status } : {}),
      ...(search ? { $or: [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ] } : {})
    };

    const [videos, total] = await Promise.all([
      Video.find(query)
        .select('-path -__v -embeddings')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      Video.countDocuments(query)
    ]);

    res.json({ 
      message: "Videos retrieved successfully",
      data: {
        videos, 
        pagination: { 
          page, 
          limit, 
          total, 
          pages: Math.ceil(total / limit) 
        }
      }
    });
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'FETCH_VIDEOS_ERROR'
    });
  }
};

// Get video by ID with proper validation
const getVideo = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        message: 'Invalid video ID format',
        code: 'INVALID_VIDEO_ID'
      });
    }

    const video = await Video.findById(id)
      .select('-path -__v -embeddings')
      .lean({ virtuals: true });

    if (!video) {
      return res.status(404).json({ 
        message: 'Video not found',
        code: 'VIDEO_NOT_FOUND'
      });
    }

    // Check ownership
    if (video.userId !== req.user.id) {
      return res.status(403).json({ 
        message: 'Access denied to this video',
        code: 'ACCESS_DENIED'
      });
    }

    res.json({
      message: "Video retrieved successfully",
      data: video
    });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'FETCH_VIDEO_ERROR'
    });
  }
};

// Get video transcript
const getVideoTranscript = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        message: 'Invalid video ID',
        code: 'INVALID_VIDEO_ID'
      });
    }

    const video = await Video.findById(id).select('transcript status userId');

    if (!video) {
      return res.status(404).json({ 
        message: 'Video not found',
        code: 'VIDEO_NOT_FOUND'
      });
    }

    if (video.userId !== req.user.id) {
      return res.status(403).json({ 
        message: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    if (video.status !== 'completed') {
      return res.status(400).json({ 
        message: 'Video is still processing',
        code: 'VIDEO_PROCESSING'
      });
    }

    if (!video.transcript) {
      return res.status(404).json({ 
        message: 'Transcript not available',
        code: 'TRANSCRIPT_UNAVAILABLE'
      });
    }

    res.json({
      message: "Transcript retrieved successfully",
      data: {
        transcript: video.transcript,
        videoId: id,
        wordCount: video.transcript.split(/\s+/).length
      }
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      code: 'FETCH_TRANSCRIPT_ERROR'
    });
  }
};

export { uploadVideo, getMyVideos, getVideo, getVideoTranscript };