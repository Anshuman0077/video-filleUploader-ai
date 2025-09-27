import express from 'express';
// import { uploadVideo, getMyVideos, getVideo, getVideoTranscript } from '../controllers/video.controller.js';
// import auth from '../middleware/auth.middleware.js';
// import upload from '../middleware/upload.middleware.js';
import {uploadVideo, getMyVideos , getVideo , getVideoTranscript } from "../controllers/video.controller.js"
import auth from "../middleware/auth.middleware.js"
import { upload } from '../middleware/upload.middleware.js';


const router = express.Router();

router.post('/upload', auth, upload.single('video'), uploadVideo);
router.get('/my-videos', auth, getMyVideos);
router.get('/:id', auth, getVideo);
router.get('/:id/transcript', auth, getVideoTranscript);

export default router;