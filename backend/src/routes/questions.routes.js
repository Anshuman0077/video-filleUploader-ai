import express from 'express';
import { askQuestion, generateVideoSummary, getVideoQuestions } from "../controllers/question.controller.js";
import auth from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * @route POST /api/questions/ask
 * @desc Ask a question about a specific video
 * @access Private
 * @param {string} videoId - Video ID
 * @param {string} question - Question text
 * @param {string} language - Response language
 */
router.post('/ask', auth, askQuestion);

/**
 * @route GET /api/questions/video/:videoId
 * @desc Get question history for a specific video
 * @access Private
 * @param {string} videoId - Video ID
 */
router.get('/video/:videoId', auth, getVideoQuestions);

/**
 * @route POST /api/questions/generate-summary
 * @desc Generate a summary for a video
 * @access Private
 * @param {string} videoId - Video ID
 * @param {string} language - Summary language
 */
router.post('/generate-summary', auth, generateVideoSummary);

export default router;