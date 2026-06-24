import crypto   from 'crypto';
import bcrypt   from 'bcryptjs';
import User     from '../models/User.js';
import StudyPlan from '../models/StudyPlan.js';
import Payment  from '../models/Payment.js';
import CancellationRequest from '../models/CancellationRequest.js';
import { sendOtpEmail }    from '../utils/email.js';

// ── POST /api/cancellation/send-otp ──────────────────────────────────────
export async function sendCancelOtp(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user)       return res.status(404).json({ message: 'User not found.' });
    if (!user.isPro) return res.status(400).json({ message: 'No active subscription to cancel.' });

    // Block if there's already a pending request
    const existing = await CancellationRequest.findOne({ userId: user._id, status: 'pending' });
    if (existing) return res.status(400).json({ message: 'You already have a pending cancellation request.' });

    const otp       = crypto.randomInt(100000, 999999).toString();
    const otpHashed = await bcrypt.hash(otp, 10);
    const expiry    = new Date(Date.now() + 10 * 60 * 1000);

    await sendOtpEmail(user.email, otp, 'cancel');

    user.cancelOtp       = otpHashed;
    user.cancelOtpExpiry = expiry;
    await user.save();

    res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/cancellation/request ───────────────────────────────────────
export async function createRequest(req, res, next) {
  try {
    const { otp, reason } = req.body;
    if (!otp) return res.status(400).json({ message: 'Verification code is required.' });

    const user = await User.findById(req.userId);
    if (!user)       return res.status(404).json({ message: 'User not found.' });
    if (!user.isPro) return res.status(400).json({ message: 'No active subscription to cancel.' });

    // Guard: only one active request
    const existing = await CancellationRequest.findOne({ userId: user._id, status: 'pending' });
    if (existing) return res.status(400).json({ message: 'You already have a pending cancellation request.' });

    // Verify OTP
    if (!user.cancelOtp || !user.cancelOtpExpiry)
      return res.status(400).json({ message: 'No verification code found. Please request a new one.' });
    if (new Date() > user.cancelOtpExpiry)
      return res.status(400).json({ message: 'Verification code expired. Please request a new one.' });

    const isMatch = await bcrypt.compare(String(otp).trim(), user.cancelOtp);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect verification code.' });

    // Clear OTP fields
    user.cancelOtp       = null;
    user.cancelOtpExpiry = null;
    await user.save();

    // Gather usage snapshot
    const [plan, studyPlan] = await Promise.all([
      Payment.findOne({ userId: user._id, status: 'paid' }).sort({ createdAt: -1 }).lean(),
      StudyPlan.findOne({ userId: user._id }).select('schedule').lean(),
    ]);

    const scheduleGenerated = Array.isArray(studyPlan?.schedule) && studyPlan.schedule.length > 0;

    const cancellationRequest = await CancellationRequest.create({
      userId: user._id,
      reason: (reason || '').trim().slice(0, 1000),
      usageSnapshot: {
        scheduleGenerated,
        aiMessageCount:    user.aiMessageCount || 0,
        subscriptionStart: user.paidAt,
        planType:          plan?.planType || 'lifetime',
      },
    });

    res.status(201).json({
      message: 'Cancellation request submitted. Awaiting admin review.',
      request: {
        id:        cancellationRequest._id,
        status:    cancellationRequest.status,
        createdAt: cancellationRequest.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/cancellation/my-status ──────────────────────────────────────
export async function getMyStatus(req, res, next) {
  try {
    const request = await CancellationRequest.findOne({ userId: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    if (!request) return res.json({ request: null });

    // FIX: If the user has re-subscribed after this request was created/resolved,
    // the request is stale — return null so the cancel button shows again.
    // Cross-check against user.paidAt: if paidAt is AFTER the request's createdAt,
    // the user has re-subscribed and the old request no longer applies.
    if (request.status !== 'pending') {
      const user = await User.findById(req.userId).select('paidAt').lean();
      if (user?.paidAt && new Date(user.paidAt) > new Date(request.createdAt)) {
        // Stale: auto-delete it so we don't keep hitting this branch
        CancellationRequest.deleteOne({ _id: request._id }).catch(() => {});
        return res.json({ request: null });
      }
    }

    res.json({
      request: {
        id:          request._id,
        status:      request.status,
        adminReason: request.adminReason || '',
        createdAt:   request.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/admin/cancellations (admin) ─────────────────────────────────
export async function adminListRequests(req, res, next) {
  try {
    const requests = await CancellationRequest.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'name email isPro paidAt')
      .lean();

    res.json({ requests });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/admin/cancellations/:id/approve (admin) ────────────────────
export async function adminApprove(req, res, next) {
  try {
    const request = await CancellationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Request already resolved.' });

    const user = await User.findById(request.userId);
    if (user) {
      user.isPro                 = false;
      user.paidAt                = null;
      user.planType              = null;
      user.subscriptionExpiresAt = null;
      await user.save();
    }

    request.status = 'approved';
    await request.save();

    res.json({ message: 'Cancellation approved and subscription revoked.' });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/admin/cancellations/:id/reject (admin) ─────────────────────
export async function adminReject(req, res, next) {
  try {
    const { adminReason } = req.body;
    if (!adminReason || !adminReason.trim())
      return res.status(400).json({ message: 'A reason is required for rejection.' });

    const request = await CancellationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    if (request.status !== 'pending') return res.status(400).json({ message: 'Request already resolved.' });

    request.status      = 'rejected';
    request.adminReason = adminReason.trim().slice(0, 1000);
    await request.save();

    res.json({ message: 'Cancellation request rejected.' });
  } catch (err) {
    next(err);
  }
}