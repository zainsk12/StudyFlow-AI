import Razorpay  from 'razorpay';
import crypto    from 'crypto';
import User      from '../models/User.js';
import Payment   from '../models/Payment.js';
import Coupon    from '../models/Coupon.js';
import Pricing   from '../models/Pricing.js';
import CancellationRequest from '../models/CancellationRequest.js';
import { sendPurchaseConfirmationEmail } from '../utils/email.js';
import { PRICING_DEFAULTS } from '../../config/pricingDefaults.js';

// Calculate subscription expiry date from DB-stored durationDays.
// Returns null for lifetime (never expires), or a Date N days from now.
// Throws if the plan is not found in DB — no hardcoded fallback.
async function calcExpiresAt(planType) {
  if (planType === 'lifetime') return null;
  const plan = await Pricing.findOne({ planType }).select('durationDays').lean();
  if (!plan) throw new Error(`Plan '${planType}' not found in database.`);
  if (typeof plan.durationDays !== 'number' || plan.durationDays <= 0)
    throw new Error(`Plan '${planType}' has invalid durationDays in database.`);
  return new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);
}

// Fetch plan price exclusively from DB. Throws if plan is missing or invalid.
// The admin panel (PATCH /api/admin/pricing/:planType) is the only way to set prices.
async function getPlanPricePaise(planType = 'lifetime') {
  const plan = await Pricing.findOne({ planType }).select('pricePaise').lean();
  if (!plan)
    throw new Error(`Plan '${planType}' not found in database. Configure it via the admin panel.`);
  if (typeof plan.pricePaise !== 'number')
    throw new Error(`Plan '${planType}' has an invalid price in database.`);
  return plan.pricePaise;
}

function getRazorpay() {
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// ── Payment / Razorpay environment helpers (tasks 1.1 / 1.2) ───────────────
// Detects values that are unconfigured placeholders rather than real secrets,
// so a half-filled .env (e.g. "<razorpay-webhook-secret>") is never mistaken
// for a configured one.
export function isPlaceholderSecret(val) {
  if (typeof val !== 'string') return true;
  const v = val.trim();
  if (v === '') return true;
  if (v.includes('<') || v.includes('>')) return true; // angle-bracket templates
  const KNOWN_PLACEHOLDERS = new Set([
    'replace_this_with_your_razorpay_webhook_secret',
    'your-razorpay-webhook-secret',
    'your-razorpay-key-secret',
    'changeme',
    'placeholder',
  ]);
  return KNOWN_PLACEHOLDERS.has(v.toLowerCase());
}

// Resolve the Razorpay key mode from the key-id prefix (rzp_live_ / rzp_test_).
export function getRazorpayMode() {
  const id = (process.env.RAZORPAY_KEY_ID || '').trim();
  if (id.startsWith('rzp_live_')) return 'live';
  if (id.startsWith('rzp_test_')) return 'test';
  return 'unknown';
}

// Startup validation (called from app.js). Pure — returns findings, never exits.
// `isProd` decides severity: test/unknown keys and missing secrets are fatal in
// production, advisory in development. Secret VALUES are never logged.
export function validatePaymentConfig({ isProd }) {
  const fatal = [];
  const warnings = [];
  const mode = getRazorpayMode();

  if (isPlaceholderSecret(process.env.RAZORPAY_KEY_ID))
    (isProd ? fatal : warnings).push('RAZORPAY_KEY_ID is missing or a placeholder.');
  if (isPlaceholderSecret(process.env.RAZORPAY_KEY_SECRET))
    (isProd ? fatal : warnings).push('RAZORPAY_KEY_SECRET is missing or a placeholder.');

  // Production must never run on test/unknown keys — financially unsafe.
  if (isProd && mode !== 'live')
    fatal.push(`Razorpay key mode is "${mode}" — production requires LIVE keys (rzp_live_…).`);

  // Webhook secret is required for reliable auto-grant of Pro after payment.
  if (isPlaceholderSecret(process.env.RAZORPAY_WEBHOOK_SECRET))
    (isProd ? fatal : warnings).push('RAZORPAY_WEBHOOK_SECRET is missing or a placeholder — webhook events will be rejected and Pro will not auto-grant after payment.');

  return { mode, fatal, warnings };
}

// Invalidate any approved/rejected cancellation requests on re-subscribe
async function clearOldCancellationRequest(userId) {
  try {
    await CancellationRequest.deleteMany({
      userId,
      status: { $in: ['approved', 'rejected'] },
    });
  } catch (err) {
    console.error('[Payment] Failed to clear old cancellation requests:', err.message);
  }
}

// ── GET /api/payment/plans ─────────────────────────────────────────────────
export async function getPlans(req, res, next) {
  try {
    let plans = await Pricing.find({}).sort({ sortOrder: 1 }).lean();

    // Bootstrap: seed default plans on very first deploy when DB is empty.
    // After this, all changes must be made through the admin panel.
    if (!plans || plans.length === 0) {
      await Pricing.insertMany(PRICING_DEFAULTS).catch(() => {});
      plans = await Pricing.find({}).sort({ sortOrder: 1 }).lean();
    }

    res.json({ plans });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/payment/validate-coupon ──────────────────────────────────────
export async function validateCoupon(req, res, next) {
  try {
    const code     = (req.body.code || '').trim().toUpperCase();
    const planType = req.body.planType || 'lifetime';

    if (!code) return res.status(400).json({ message: 'Coupon code is required.' });

    const coupon = await Coupon.findOne({ code });
    if (!coupon || !coupon.isValid)
      return res.status(400).json({ message: 'Invalid or expired coupon code.' });

    const original = await getPlanPricePaise(planType);
    const discount = Math.round(original * coupon.discountPct / 100);
    const final    = Math.max(0, original - discount);

    res.json({
      discountPct:         coupon.discountPct,
      originalAmountPaise: original,
      finalAmountPaise:    final,
      isFree: final === 0,
    });
  } catch (err) {
    next(err);
  }
}

async function incrementUniqueUse(code, userId, excludePaymentId = null) {
  const query = { userId, couponCode: code, status: 'paid' };
  if (excludePaymentId) query._id = { $ne: excludePaymentId };
  const previousUse = await Payment.findOne(query).select('_id').lean();
  if (!previousUse) {
    await Coupon.findOneAndUpdate({ code }, { $inc: { usedCount: 1 } });
  }
}

// ── POST /api/payment/create-order ────────────────────────────────────────
export async function createOrder(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (user.isPro)
      return res.status(400).json({ message: 'You already have Pro access.' });

    const VALID_PLAN_TYPES = ['monthly', 'yearly', 'lifetime'];
    const planType = VALID_PLAN_TYPES.includes(req.body.planType)
      ? req.body.planType
      : 'lifetime';

    // All plan data comes exclusively from DB — frontend-supplied price is ignored.
    const planRecord = await Pricing.findOne({ planType }).lean();
    if (!planRecord)
      return res.status(400).json({ message: 'Plan not found. Please refresh and try again.' });
    if (planRecord.isEnabled === false)
      return res.status(400).json({ message: 'This plan is currently unavailable.' });

    const code = (req.body.couponCode || '').trim().toUpperCase();
    let discountPct = 0;
    let coupon      = null;

    if (code) {
      coupon = await Coupon.findOne({ code });
      if (!coupon || !coupon.isValid)
        return res.status(400).json({ message: 'Invalid or expired coupon code.' });
      discountPct = coupon.discountPct;
    }

    // Price is read from DB — never from request body or environment variables.
    const original   = planRecord.pricePaise;
    const discount   = Math.round(original * discountPct / 100);
    const finalPaise = Math.max(0, original - discount);

    if (finalPaise === 0) {
      const paymentRecord = await Payment.create({
        userId:              user._id,
        razorpayOrderId:     `FREE_${Date.now()}`,
        razorpayPaymentId:   null,
        razorpaySignature:   null,
        amountPaise:         0,
        originalAmountPaise: original,
        couponCode:          code || null,
        discountPct,
        planType,
        status:              'paid',
      });

      if (coupon) {
        await incrementUniqueUse(code, user._id, paymentRecord._id);
      }

      await clearOldCancellationRequest(user._id);

      const expiresAt   = await calcExpiresAt(planType);
      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id, isPro: { $ne: true } },
        { $set: { isPro: true, paidAt: new Date(), paymentId: `FREE_COUPON_${code}`, planType, subscriptionExpiresAt: expiresAt } },
        { new: true }
      );
      const finalUser = updatedUser || await User.findById(user._id);

      sendPurchaseConfirmationEmail(
        finalUser.email, finalUser.name, 0, code,
        { planType, label: planRecord.label, expiresAt }
      ).catch(console.error);

      const { password: _pw, tokenVersion: _tv, resetOtp: _ro, resetOtpExpiry: _roe, resetVerified: _rv, ...safeUser } = finalUser.toObject();
      return res.json({ free: true, user: safeUser });
    }

    const razorpay = getRazorpay();
    const order    = await razorpay.orders.create({
      amount:   finalPaise,
      currency: 'INR',
      receipt:  `sf_${req.userId.toString().slice(-8)}_${Date.now().toString().slice(-8)}`,
      notes:    { userId: req.userId.toString(), couponCode: code || '', planType },
    });

    await Payment.create({
      userId:              req.userId,
      razorpayOrderId:     order.id,
      amountPaise:         finalPaise,
      originalAmountPaise: original,
      couponCode:          code || null,
      discountPct,
      planType,
      status:              'created',
    });

    res.json({
      free:                false,
      orderId:             order.id,
      amountPaise:         finalPaise,
      originalAmountPaise: original,
      discountPct,
      planType,
      currency:            'INR',
      keyId:               process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    if (err.error && err.error.description) {
      return res.status(err.statusCode || 400).json({ message: err.error.description });
    }
    next(err);
  }
}

// ── POST /api/payment/verify ──────────────────────────────────────────────
export async function verifyPayment(req, res, next) {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
      return res.status(400).json({ message: 'Missing payment verification fields.' });

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expected !== razorpaySignature)
      return res.status(400).json({ message: 'Payment verification failed. Please contact support.' });

    const paymentRecord = await Payment.findOneAndUpdate(
      { razorpayOrderId, userId: req.userId, status: { $ne: 'paid' } },
      { $set: { razorpayPaymentId, razorpaySignature, status: 'paid' } },
      { new: true }
    );
    if (!paymentRecord) {
      const existing = await Payment.findOne({ razorpayOrderId, userId: req.userId });
      if (!existing) return res.status(404).json({ message: 'Payment record not found.' });
      const user = await User.findById(req.userId);
      const { password: _pw, tokenVersion: _tv, resetOtp: _ro, resetOtpExpiry: _roe, resetVerified: _rv, ...safeUser } = user.toObject();
      return res.json({ success: true, user: safeUser });
    }

    const code = (paymentRecord.couponCode || '').trim().toUpperCase();
    if (code) {
      await incrementUniqueUse(code, req.userId, paymentRecord._id);
    }

    await clearOldCancellationRequest(req.userId);

    const expiresAt   = await calcExpiresAt(paymentRecord.planType);
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, isPro: { $ne: true } },
      { $set: { isPro: true, paidAt: new Date(), paymentId: razorpayPaymentId, planType: paymentRecord.planType, subscriptionExpiresAt: expiresAt } },
      { new: true }
    );
    const user = updatedUser || await User.findById(req.userId);

    sendPurchaseConfirmationEmail(
      user.email, user.name, paymentRecord.amountPaise, code || null,
      { planType: paymentRecord.planType, expiresAt }
    ).catch(console.error);

    const { password: _pw, tokenVersion: _tv, resetOtp: _ro, resetOtpExpiry: _roe, resetVerified: _rv, ...safeUser } = user.toObject();
    res.json({ success: true, user: safeUser });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/payment/webhook ─────────────────────────────────────────────
export async function handleWebhook(req, res) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Reject when the secret is unset OR still a placeholder — never trust a
    // half-configured webhook secret.
    if (isPlaceholderSecret(webhookSecret)) {
      console.error('[Webhook] RAZORPAY_WEBHOOK_SECRET is not configured (missing/placeholder) — rejecting event.');
      return res.status(500).json({ status: 'misconfigured' });
    }

    const receivedSig = req.headers['x-razorpay-signature'];
    if (!receivedSig) {
      return res.status(400).json({ message: 'Missing webhook signature.' });
    }

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body)
      .digest('hex');

    // Constant-time comparison to avoid leaking signature bytes via timing.
    // timingSafeEqual throws on unequal lengths, so length-check first.
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const receivedBuf = Buffer.from(String(receivedSig), 'utf8');
    const sigValid =
      expectedBuf.length === receivedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, receivedBuf);

    if (!sigValid) {
      console.warn('[Webhook] Signature mismatch — possible spoofed request');
      return res.status(400).json({ message: 'Invalid webhook signature.' });
    }

    const event     = JSON.parse(req.body.toString());
    const eventType = event.event;
    console.log(`[Webhook] Received event: ${eventType}`);

    if (eventType === 'payment.captured') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      const payId   = payment.id;

      const record = await Payment.findOneAndUpdate(
        { razorpayOrderId: orderId, status: { $ne: 'paid' } },
        { $set: { razorpayPaymentId: payId, status: 'paid' } },
        { new: true }
      );

      if (!record) {
        const existing = await Payment.findOne({ razorpayOrderId: orderId });
        if (!existing) console.warn(`[Webhook] No payment record found for order ${orderId}`);
        else console.log(`[Webhook] Order ${orderId} already processed — skipping.`);
        return res.status(200).json({ status: existing ? 'already_processed' : 'no_record' });
      }

      if (record.couponCode) {
        await incrementUniqueUse(record.couponCode, record.userId, record._id);
      }

      await clearOldCancellationRequest(record.userId);

      const expiresAt = await calcExpiresAt(record.planType);
      const user = await User.findOneAndUpdate(
        { _id: record.userId, isPro: { $ne: true } },
        { $set: { isPro: true, paidAt: new Date(), paymentId: payId, planType: record.planType, subscriptionExpiresAt: expiresAt } },
        { new: true }
      ) || await User.findById(record.userId);

      if (user) {
        sendPurchaseConfirmationEmail(
          user.email, user.name, record.amountPaise, record.couponCode || null,
          { planType: record.planType, expiresAt }
        ).catch(console.error);
        console.log(`[Webhook] Pro access granted to user ${user._id} via order ${orderId}`);
      }
    }

    if (eventType === 'payment.failed') {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;
      await Payment.findOneAndUpdate({ razorpayOrderId: orderId }, { status: 'failed' });
      console.log(`[Webhook] Payment failed for order ${orderId}`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Webhook] Error processing webhook:', err);
    res.status(200).json({ status: 'error' });
  }
}

// ── GET /api/payment/status ───────────────────────────────────────────────
export async function getStatus(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('isPro paidAt planType subscriptionExpiresAt');
    res.json({
      isPro:                 user?.isPro                 ?? false,
      paidAt:                user?.paidAt                ?? null,
      planType:              user?.planType              ?? null,
      subscriptionExpiresAt: user?.subscriptionExpiresAt ?? null,
    });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/payment/cancel ──────────────────────────────────────────────
export async function cancelSubscription(req, res, next) {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'Verification code is required.' });

    const user = await User.findById(req.userId);
    if (!user)        return res.status(404).json({ message: 'User not found.' });
    if (!user.isPro)  return res.status(400).json({ message: 'No active subscription to cancel.' });

    if (!user.cancelOtp || !user.cancelOtpExpiry)
      return res.status(400).json({ message: 'No verification code found. Please request a new one.' });

    if (new Date() > user.cancelOtpExpiry)
      return res.status(400).json({ message: 'Verification code expired. Please request a new one.' });

    const bcrypt  = await import('bcryptjs');
    const isMatch = await bcrypt.default.compare(String(otp).trim(), user.cancelOtp);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect verification code.' });

    user.isPro                 = false;
    user.paidAt                = null;
    user.planType              = null;
    user.subscriptionExpiresAt = null;
    user.cancelOtp             = null;
    user.cancelOtpExpiry       = null;
    await user.save();

    res.status(200).json({ message: 'Subscription cancelled successfully.' });
  } catch (err) {
    next(err);
  }
}