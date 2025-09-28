import express from 'express';
import { uploadVideo, getMyVideos, getVideo, getVideoTranscript } from "../controllers/video.controller.js";
import auth from "../middleware/auth.middleware.js";
import { upload } from '../middleware/upload.middleware.js';

const router = express.Router();

/**
 * @route POST /api/videos/upload
 * @desc Upload a new video for processing
 * @access Private
 * @param {string} title - Video title
 * @param {string} description - Video description
 * @param {file} video - Video file
 * @param {string} language - Processing language
 */
router.post('/upload', auth, upload.single('video'), uploadVideo);

/**
 * @route GET /api/videos/my-videos
 * @desc Get authenticated user's videos with pagination and filtering
 * @access Private
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 * @param {string} status - Filter by status
 * @param {string} search - Search in title and description
 */
router.get('/my-videos', auth, getMyVideos);

/**
 * @route GET /api/videos/:id
 * @desc Get specific video by ID
 * @access Private
 * @param {string} id - Video ID
 */
router.get('/:id', auth, getVideo);

/**
 * @route GET /api/videos/:id/transcript
 * @desc Get video transcript
 * @access Private
 * @param {string} id - Video ID
 */
router.get('/:id/transcript', auth, getVideoTranscript);

export default router;