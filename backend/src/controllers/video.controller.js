import Video from "../models/videos.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { processVideoQueue } from "../queues/video.queue.js"
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
  
  return errors;
};

// Upload video
const uploadVideo = async (req, res) => {
  let tempFile = req.file?.path;

  try {
    const { title, description, language = 'english' } = req.body;

    // Input validation
    const validationErrors = validateVideoInput(title, description);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    const uploadedFilePath = path.resolve(req.file.path);
    if (!uploadedFilePath.startsWith(path.resolve(TEMP_DIR))) {
      await fs.promises.unlink(uploadedFilePath).catch(() => { });
      return res.status(400).json({ message: 'Invalid file path' });
    }

    // Upload to Cloudinary
    const cloudinaryResponse = await uploadOnCloudinary(tempFile);
    if (!cloudinaryResponse || !cloudinaryResponse.secure_url) {
        tempFile = null;
        return res.status(500).json({ message: 'Failed to upload video to cloud' });
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
    });
    
    // Emit socket event for real-time update to video room
    const io = req.app.get('socketio');
    if (io) {
        io.to(video._id.toString()).emit('video-uploaded', {
          videoId: video._id.toString(),
          status: 'queued',
          title: video.title
        });
    }
    
    tempFile = null;

    res.status(201).json({
        message: 'Video uploaded successfully',
        data: {
            videoId: video._id,
            status: video.status,
            title: video.title
        }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      message: 'Upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  } finally {
      if (tempFile) {
          cleanupTempFile(tempFile);
      }
  }
};

// Get user's videos with pagination and filters
const getMyVideos = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const { status, search } = req.query;

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
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        }
    });
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get video by ID with proper validation
const getVideo = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid video ID' });
    }

    const video = await Video.findById(id)
      .select('-path -__v -embeddings')
      .lean({ virtuals: true });

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Check ownership
    if (video.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
        message: "Video retrieved successfully",
        data: video
    });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get video transcript
const getVideoTranscript = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid video ID' });
    }

    const video = await Video.findById(id).select('transcript status userId');

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    if (video.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (video.status !== 'completed') {
      return res.status(400).json({ message: 'Video is still processing' });
    }

    if (!video.transcript) {
      return res.status(404).json({ message: 'Transcript not available' });
    }

    res.json({
      message: "Transcript retrieved successfully",
      data: {
        transcript: video.transcript,
        videoId: id
      }
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export { uploadVideo, getMyVideos, getVideo, getVideoTranscript };