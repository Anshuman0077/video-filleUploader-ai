import express from 'express';
// import {askQuestion , getVideoQuestions , generateVideoSummary} from "../controllers/question.controller.js";
import {askQuestion, generateVideoSummary , getVideoQuestions} from "../controllers/question.controller.js"
import auth from "../middleware/auth.middleware.js";

const router = express.Router();

router.post('/ask', auth, askQuestion);
router.get('/video/:videoId', auth, getVideoQuestions);
router.post('/generate-summary', auth, generateVideoSummary);

export default router;