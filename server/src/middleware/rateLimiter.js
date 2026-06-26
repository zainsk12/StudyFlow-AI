import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many requests, please try again later.' },
});

export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'AI request limit reached, please wait a moment.' },
});

// Fix 1: dedicated auth limiter — 10 attempts / 15 min
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many login attempts, please try again in 15 minutes.' },
});

// Fix 1: OTP limiter — 5 attempts / 10 min (OTP has only 900k combos)
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max:      5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many OTP attempts, please wait 10 minutes.' },
});

// Fix 1: forgot-password limiter — 3 requests / 15 min
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      3,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many password reset requests, please try again in 15 minutes.' },
});

// Task 3.2: dedicated admin limiters (own buckets, separate from the global
// limiter) so admin traffic is isolated and secret-guessing is bounded.
//
// adminApiLimiter — for /api/admin/*. Generous enough for the admin panel's
// 30s dashboard polling plus actions, while still capping automated guessing.
export const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many admin requests, please slow down.' },
});

// adminPanelLimiter — for the HTTP-Basic /admin-panel page. Strict: legit
// admins load it rarely, so this tightly throttles Basic-auth guessing.
export const adminPanelLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many attempts, please try again later.' },
});

// Fix 6: user-ID based limiter factory — bypasses VPN/IP rotation
// Use AFTER protect middleware so req.userId is set
export function userRateLimiter(max = 30, windowMins = 15) {
  return rateLimit({
    windowMs: windowMins * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    keyGenerator: (req) => req.userId ? `user:${req.userId}` : req.ip,
    message: { message: 'Too many requests for this account, please slow down.' },
  });
}