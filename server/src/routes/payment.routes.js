import { Router }        from 'express';
import { protect }       from '../middleware/auth.middleware.js';
import { rateLimiter, otpLimiter } from '../middleware/rateLimiter.js';
import express           from 'express';
import {
  getPlans,
  validateCoupon,
  createOrder,
  verifyPayment,
  handleWebhook,
  getStatus,
  cancelSubscription,
} from '../controllers/payment.controller.js';

const router = Router();

// ── Webhook — MUST come before express.json() and rate limiter ─────────────
// Razorpay webhook needs raw Buffer body to verify HMAC signature.
// It must NOT be rate-limited — Razorpay retries on non-2xx and may send
// bursts for the same event.
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleWebhook
);

// ── JSON body parsing for all non-webhook routes ──────────────────────────
// /api/payment is mounted in app.js BEFORE the global express.json() so that
// the webhook above gets a raw Buffer.  That means all other POST routes in
// this router would have req.body === undefined without this line.
router.use(express.json({ limit: '5mb' }));

// ── Rate limiting for all non-webhook routes ──────────────────────────────
// The global rateLimiter in app.js never fires for /api/payment/* because
// this router is mounted before it.  Apply it here explicitly.
router.use(rateLimiter);

// ── Public route — no auth needed ─────────────────────────────────────────
router.get('/plans', getPlans);

// ── Protected routes — logged-in user required ────────────────────────────
router.use(protect);

router.post('/validate-coupon', validateCoupon);
router.post('/create-order',    createOrder);
router.post('/verify',          verifyPayment);
router.get( '/status',          getStatus);
router.post('/cancel', otpLimiter, cancelSubscription);

export default router;