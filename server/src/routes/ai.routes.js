import express from 'express';
import { chatWithAI, regenAdvice } from '../controllers/ai.controller.js';
import { protect }                  from '../middleware/auth.middleware.js';
import { requirePro }               from '../middleware/requirePro.middleware.js';
import { aiRateLimiter, userRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Fix 6: user-ID limiter stacked on top of IP limiter
const aiUserLimiter = userRateLimiter(20, 15);

router.post('/chat',         protect, requirePro, aiRateLimiter, aiUserLimiter, chatWithAI);
router.post('/regen-advice', protect, requirePro, aiRateLimiter, aiUserLimiter, regenAdvice);

export default router;