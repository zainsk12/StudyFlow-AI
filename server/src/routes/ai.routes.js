import express from 'express';
import { chatWithAI, regenAdvice } from '../controllers/ai.controller.js';
import { protect }                  from '../middleware/auth.middleware.js';
import { aiRateLimiter, userRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Fix 6: user-ID limiter stacked on top of IP limiter
const aiUserLimiter = userRateLimiter(20, 15);

router.post('/chat',         protect, aiRateLimiter, aiUserLimiter, chatWithAI);
router.post('/regen-advice', protect, aiRateLimiter, aiUserLimiter, regenAdvice);

export default router;
