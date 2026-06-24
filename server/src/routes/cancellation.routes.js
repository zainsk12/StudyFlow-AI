import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { otpLimiter } from '../middleware/rateLimiter.js';
import {
  sendCancelOtp,
  createRequest,
  getMyStatus,
} from '../controllers/cancellation.controller.js';

const router = Router();

router.use(protect);

router.post('/send-otp',  otpLimiter, sendCancelOtp);
router.post('/request',              createRequest);
router.get ('/my-status',            getMyStatus);

export default router;