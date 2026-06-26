import Coupon    from '../models/Coupon.js';
import Payment   from '../models/Payment.js';
import User      from '../models/User.js';
import StudyPlan from '../models/StudyPlan.js';
import nodemailer from 'nodemailer';
import { invalidateUserCache } from '../middleware/auth.middleware.js';

// ── GET /api/admin/stats ──────────────────────────────────────────────────
export async function getStats(req, res, next) {
  try {
    // FIX (Bug 7): Old code called Payment.find({ status: 'paid' }) twice --
    // once for revenue totals and again for recentPayments, wasting a DB round-trip.
    // Now: one aggregation for totals + one limited query for recent payments.
    const [totalUsers, proUsers, revenueAgg, recentPayments] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isPro: true }),
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
      ]),
      Payment.find({ status: 'paid' })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'name email'),
    ]);

    const totalRevenuePaise = revenueAgg[0]?.total ?? 0;
    const totalTransactions = revenueAgg[0]?.count ?? 0;

    res.json({
      totalUsers,
      proUsers,
      freeUsers:          totalUsers - proUsers,
      totalRevenuePaise,
      totalRevenueINR:    (totalRevenuePaise / 100).toFixed(2),
      totalTransactions,
      recentPayments: recentPayments.map(p => ({
        id:          p._id,
        userName:    p.userId?.name  ?? 'Unknown',
        userEmail:   p.userId?.email ?? 'Unknown',
        amountINR:   (p.amountPaise / 100).toFixed(2),
        couponCode:  p.couponCode,
        discountPct: p.discountPct,
        date:        p.createdAt,
      })),
    });
  } catch (err) { next(err); }
}

// ── GET /api/admin/coupons ────────────────────────────────────────────────
export async function getCoupons(req, res, next) {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) { next(err); }
}

// ── POST /api/admin/coupons ───────────────────────────────────────────────
export async function createCoupon(req, res, next) {
  try {
    const { code, discountPct, maxUses, expiresAt, note } = req.body;
    if (!code || !discountPct)
      return res.status(400).json({ message: '`code` and `discountPct` are required.' });
    if (discountPct < 10 || discountPct > 100)
      return res.status(400).json({ message: 'discountPct must be between 10 and 100.' });
    const existing = await Coupon.findOne({ code: code.trim().toUpperCase() });
    if (existing)
      return res.status(400).json({ message: 'A coupon with that code already exists.' });
    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      discountPct: Number(discountPct),
      maxUses:  maxUses  ? Number(maxUses)  : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      note: note || '',
    });
    res.status(201).json(coupon);
  } catch (err) { next(err); }
}

// ── PATCH /api/admin/coupons/:id ──────────────────────────────────────────
export async function updateCoupon(req, res, next) {
  try {
    const allowed = ['isActive', 'note', 'maxUses', 'expiresAt', 'discountPct'];
    const updates = {};
    for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = req.body[key]; }
    if (req.body.maxUses   === null) updates.maxUses   = null;
    if (req.body.expiresAt === null) updates.expiresAt = null;
    // FIX (Bug 4): Validate discountPct range on PATCH just like on POST.
    // Without this, a PATCH request can set discountPct to any number (e.g. 0 or 200)
    // because the validation block only existed in the createCoupon handler,
    // and the Mongoose schema has no range constraint either.
    if (updates.discountPct !== undefined) {
      const pct = Number(updates.discountPct);
      if (isNaN(pct) || pct < 10 || pct > 100)
        return res.status(400).json({ message: 'discountPct must be between 10 and 100.' });
      updates.discountPct = pct;
    }
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });
    if (updates.isActive === false) {
      const affectedPayments = await Payment.find({ couponCode: coupon.code, status: 'paid' }).select('userId');
      const userIds = affectedPayments.map(p => p.userId);
      if (userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds }, paymentId: `FREE_COUPON_${coupon.code}` },
          { isPro: false, paidAt: null, paymentId: null }
        );
        // Evict affected users so the revoked Pro status is seen immediately (task 2.2).
        userIds.forEach((id) => invalidateUserCache(id));
      }
    }
    res.json(coupon);
  } catch (err) { next(err); }
}

// ── DELETE /api/admin/coupons/:id ─────────────────────────────────────────
export async function deleteCoupon(req, res, next) {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });
    res.json({ message: 'Coupon deleted.' });
  } catch (err) { next(err); }
}

// ── POST /api/admin/coupons/recalculate-counts ────────────────────────────
export async function recalculateCouponCounts(req, res, next) {
  try {
    const coupons = await Coupon.find().select('code usedCount');
    const results = [];
    for (const coupon of coupons) {
      const uniqueUsers  = await Payment.distinct('userId', { couponCode: coupon.code, status: 'paid' });
      const correctCount = uniqueUsers.length;
      const oldCount     = coupon.usedCount;
      if (correctCount !== oldCount) {
        await Coupon.findByIdAndUpdate(coupon._id, { usedCount: correctCount });
        results.push({ code: coupon.code, before: oldCount, after: correctCount });
      }
    }
    res.json({
      message: results.length > 0 ? `Fixed ${results.length} coupon(s).` : 'All coupon counts were already correct.',
      fixed: results,
    });
  } catch (err) { next(err); }
}

// ── GET /api/admin/coupons/:id/users ─────────────────────────────────────
export async function getCouponRedeemers(req, res, next) {
  try {
    const coupon = await Coupon.findById(req.params.id).select('code');
    if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });
    const payments = await Payment
      .find({ couponCode: coupon.code, status: 'paid' })
      .populate('userId', 'name email isPro paidAt')
      .sort({ createdAt: -1 });
    const redeemers = payments.map(p => ({
      paymentId:  p._id,
      name:       p.userId?.name  ?? 'Deleted User',
      email:      p.userId?.email ?? '—',
      isPro:      p.userId?.isPro ?? false,
      amountINR:  (p.amountPaise / 100).toFixed(2),
      redeemedAt: p.createdAt,
    }));
    res.json({ couponCode: coupon.code, count: redeemers.length, redeemers });
  } catch (err) { next(err); }
}

// ── GET /api/admin/users ──────────────────────────────────────────────────
export async function getUsers(req, res, next) {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const skip   = (page - 1) * limit;
    const search = req.query.search?.trim();
    const status = req.query.status; // 'active' | 'expired' | 'free'

    const now = new Date();
    let filter = {};

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name:  { $regex: search, $options: 'i' } },
      ];
    }

    if (status === 'free') {
      filter.isPro = false;
    } else if (status === 'active') {
      // isPro=true AND (lifetime: expiresAt is null, OR timed: expiresAt > now)
      filter.isPro = true;
      filter.$or = [
        { subscriptionExpiresAt: null },
        { subscriptionExpiresAt: { $gt: now } },
      ];
    } else if (status === 'expired') {
      // isPro may still be true but expiry has passed
      filter.isPro = true;
      filter.subscriptionExpiresAt = { $lt: now };
    }
    const [users, total] = await Promise.all([
      User.find(filter).select('-password -tokenVersion -resetOtp -resetOtpExpiry -resetVerified').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({
      users,
      pagination: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        hasNext:    page * limit < total,
        hasPrev:    page > 1,
      },
    });
  } catch (err) { next(err); }
}

// ── GET /api/admin/users/:id/payments ────────────────────────────────────
export async function getUserPayments(req, res, next) {
  try {
    const user = await User.findById(req.params.id).select('name email isPro');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const payments = await Payment.find({ userId: req.params.id }).sort({ createdAt: -1 });
    res.json({
      user: { name: user.name, email: user.email, isPro: user.isPro },
      payments: payments.map(p => ({
        id:                p._id,
        status:            p.status,
        amountINR:         (p.amountPaise / 100).toFixed(2),
        couponCode:        p.couponCode        ?? null,
        discountPct:       p.discountPct       ?? null,
        razorpayOrderId:   p.razorpayOrderId   ?? null,
        razorpayPaymentId: p.razorpayPaymentId ?? null,
        createdAt:         p.createdAt,
      })),
    });
  } catch (err) { next(err); }
}

// ── PATCH /api/admin/users/:id/grant-pro ─────────────────────────────────
export async function grantPro(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isPro: true, paidAt: new Date(), paymentId: 'ADMIN_GRANT', planType: 'lifetime', subscriptionExpiresAt: null },
      { new: true }
    ).select('-password -tokenVersion -resetOtp -resetOtpExpiry -resetVerified');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    invalidateUserCache(req.params.id);
    res.json(user);
  } catch (err) { next(err); }
}

// ── PATCH /api/admin/users/:id/revoke-pro ────────────────────────────────
export async function revokePro(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isPro: false, paidAt: null, paymentId: null, planType: null, subscriptionExpiresAt: null },
      { new: true }
    ).select('-password -tokenVersion -resetOtp -resetOtpExpiry -resetVerified');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    invalidateUserCache(req.params.id);
    res.json(user);
  } catch (err) { next(err); }
}

// ── PATCH /api/admin/users/:id/extend-subscription ───────────────────────
export async function extendSubscription(req, res, next) {
  try {
    const { days, months } = req.body;
    if (!days && !months)
      return res.status(400).json({ message: '`days` or `months` is required.' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Lifetime plan — cannot extend a null expiry
    if (user.isPro && user.subscriptionExpiresAt === null && user.planType === 'lifetime')
      return res.status(400).json({ message: 'Lifetime subscribers have no expiry to extend.' });

    const now = new Date();
    // Base: current expiry if still in future, otherwise start from now
    const base = (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now)
      ? new Date(user.subscriptionExpiresAt)
      : new Date(now);

    if (days)   base.setDate(base.getDate() + Number(days));
    if (months) base.setMonth(base.getMonth() + Number(months));

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { isPro: true, subscriptionExpiresAt: base },
      { new: true }
    ).select('-password -tokenVersion -resetOtp -resetOtpExpiry -resetVerified');

    invalidateUserCache(req.params.id);
    res.json(updated);
  } catch (err) { next(err); }
}

// ── PATCH /api/admin/users/:id/downgrade ──────────────────────────────────
export async function downgradeUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isPro: false, paidAt: null, paymentId: null, planType: null, subscriptionExpiresAt: null },
      { new: true }
    ).select('-password -tokenVersion -resetOtp -resetOtpExpiry -resetVerified');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    invalidateUserCache(req.params.id);
    res.json(user);
  } catch (err) { next(err); }
}

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────
export async function deleteUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const [spResult, payResult] = await Promise.all([
      StudyPlan.deleteMany({ userId: req.params.id }),
      Payment.deleteMany({ userId: req.params.id }),
    ]);
    await User.findByIdAndDelete(req.params.id);
    invalidateUserCache(req.params.id);
    console.log(`[ADMIN] Deleted user ${user.email} — ${spResult.deletedCount} study plans, ${payResult.deletedCount} payments cascaded.`);
    res.json({
      message: `User "${user.email}" deleted.`,
      cascaded: { studyPlans: spResult.deletedCount, payments: payResult.deletedCount },
    });
  } catch (err) { next(err); }
}

// ── POST /api/admin/broadcast ─────────────────────────────────────────────
// Hard cap: reject requests that would send to more than this many recipients
// in a single call. Prevents accidental account-level Gmail rate-limit bans
// and keeps the HTTP request from hanging for minutes.
const BROADCAST_RECIPIENT_LIMIT = 500;

// Number of emails to fire concurrently per batch. Gmail's SMTP connection
// pool can typically handle ~10 parallel sends without triggering rate limits.
const BROADCAST_BATCH_SIZE = 10;

export async function broadcastEmail(req, res, next) {
  try {
    const { subject, body, audience } = req.body;
    if (!subject || !body || !audience)
      return res.status(400).json({ message: '`subject`, `body`, and `audience` are required.' });
    if (!['all', 'pro', 'free'].includes(audience))
      return res.status(400).json({ message: 'audience must be "all", "pro", or "free".' });

    const filter =
      audience === 'pro'  ? { isPro: true  } :
      audience === 'free' ? { isPro: false } : {};

    const users = await User.find(filter).select('email name');
    if (users.length === 0)
      return res.json({ message: 'No users matched the selected audience.', sent: 0 });

    if (users.length > BROADCAST_RECIPIENT_LIMIT) {
      return res.status(400).json({
        message: `Audience too large (${users.length} recipients). Maximum allowed per broadcast is ${BROADCAST_RECIPIENT_LIMIT}.`,
      });
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass)
      return res.status(500).json({ message: 'Email credentials not configured in server .env' });

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: emailUser, pass: emailPass } });
    const from = process.env.EMAIL_FROM || `StudyFlow AI <${emailUser}>`;

    function escHtml(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    const safeSubject = escHtml(subject);
    const htmlBody = body
      .split(/\n\n+/)
      .map(para => `<p style="font-size:14px;color:#94a3b8;line-height:1.7;margin:0 0 16px">${escHtml(para).replace(/\n/g, '<br/>')}</p>`)
      .join('');

    const buildHtml = () => `
            <div style="font-family:'Segoe UI',sans-serif;background:#0d1117;padding:40px 20px">
              <div style="max-width:520px;margin:0 auto;background:#1c2030;border:1px solid #252d42;border-radius:16px;padding:40px 36px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px">
                  <div style="width:44px;height:44px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px;font-size:22px;display:flex;align-items:center;justify-content:center">🎓</div>
                  <div><div style="font-size:20px;font-weight:700;color:#f1f5f9">StudyFlow AI</div><div style="font-size:11px;color:#475569">Intelligent Study Planner</div></div>
                </div>
                <h2 style="font-size:20px;font-weight:700;color:#f1f5f9;margin:0 0 20px">${safeSubject}</h2>
                ${htmlBody}
                <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0"/>
                <p style="font-size:11px;color:#334155;text-align:center;margin:0">You received this because you have a StudyFlow AI account.</p>
              </div>
            </div>`;

    let sent = 0; let failed = 0;

    // Send in batches to avoid blocking the event loop for the full duration
    // and to stay within Gmail's concurrent-connection limits.
    for (let i = 0; i < users.length; i += BROADCAST_BATCH_SIZE) {
      const batch = users.slice(i, i + BROADCAST_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(user =>
          transporter.sendMail({ from, to: user.email, subject, text: body, html: buildHtml() })
        )
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'fulfilled') {
          sent++;
        } else {
          failed++;
          console.error(`[BROADCAST] Failed → ${batch[j].email}:`, results[j].reason?.message);
        }
      }
    }

    console.log(`[ADMIN] Broadcast "${subject}" → ${sent} sent, ${failed} failed (audience: ${audience})`);
    res.json({ message: `Broadcast sent to ${sent} user(s)${failed > 0 ? `, ${failed} failed` : ''}.`, sent, failed, total: users.length });
  } catch (err) { next(err); }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRICING
// ═══════════════════════════════════════════════════════════════════════════
import Pricing from '../models/Pricing.js';
import { PRICING_DEFAULTS } from '../../config/pricingDefaults.js';

// ── Shared price/duration validator ──────────────────────────────────────
function validatePricingFields(body, res) {
  const { name, pricePaise, durationDays, originalPricePaise } = body;

  if (name !== undefined && !String(name).trim())
    return res.status(400).json({ message: '`name` cannot be blank.' });

  if (pricePaise !== undefined) {
    const p = Number(pricePaise);
    if (isNaN(p) || p < 0)
      return res.status(400).json({ message: 'pricePaise must be a non-negative number.' });
  }
  if (originalPricePaise !== undefined && originalPricePaise !== null) {
    const p = Number(originalPricePaise);
    if (isNaN(p) || p < 0)
      return res.status(400).json({ message: 'originalPricePaise must be a non-negative number.' });
  }
  if (durationDays !== undefined && durationDays !== null) {
    const d = Number(durationDays);
    if (isNaN(d) || d < 1 || !Number.isInteger(d))
      return res.status(400).json({ message: 'durationDays must be a positive integer, or null for lifetime.' });
  }
  return null; // no error
}

// ── GET /api/admin/pricing ────────────────────────────────────────────────
export async function getPricing(req, res, next) {
  try {
    let plans = await Pricing.find().sort({ sortOrder: 1, createdAt: 1 });

    // Seed defaults on first load — ensures base plans always exist
    if (plans.length === 0) {
      await Pricing.insertMany(PRICING_DEFAULTS);
      plans = await Pricing.find().sort({ sortOrder: 1, createdAt: 1 });
    }

    res.json(plans);
  } catch (err) { next(err); }
}

// ── POST /api/admin/pricing ───────────────────────────────────────────────
export async function createPricing(req, res, next) {
  try {
    const { name, label, pricePaise, originalPricePaise, badge, description, durationDays, isEnabled, sortOrder } = req.body;

    if (!name || !String(name).trim())
      return res.status(400).json({ message: '`name` is required.' });
    if (pricePaise === undefined || pricePaise === null || pricePaise === '')
      return res.status(400).json({ message: '`pricePaise` is required.' });

    const errResp = validatePricingFields(req.body, res);
    if (errResp) return;

    // Derive a slug-safe planType from the name
    const planType = String(name).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!planType)
      return res.status(400).json({ message: 'Could not derive a valid plan identifier from `name`.' });

    const exists = await Pricing.findOne({ planType });
    if (exists)
      return res.status(400).json({ message: `A plan with the identifier "${planType}" already exists.` });

    const maxSort = await Pricing.find().sort({ sortOrder: -1 }).limit(1);
    const nextSort = maxSort.length ? (maxSort[0].sortOrder + 1) : 0;

    const plan = await Pricing.create({
      planType,
      name:               String(name).trim(),
      label:              label  ? String(label).trim()  : String(name).trim(),
      pricePaise:         Number(pricePaise),
      originalPricePaise: originalPricePaise != null ? Number(originalPricePaise) : null,
      badge:              badge       ? String(badge).trim()       : '',
      description:        description ? String(description).trim() : '',
      durationDays:       durationDays != null ? Number(durationDays) : null,
      isEnabled:          isEnabled !== false,
      sortOrder:          sortOrder != null ? Number(sortOrder) : nextSort,
    });

    console.log(`[ADMIN] Pricing plan created: "${plan.name}" (${plan.planType}) @ ₹${(plan.pricePaise/100).toFixed(0)}`);
    res.status(201).json(plan);
  } catch (err) { next(err); }
}

// ── PATCH /api/admin/pricing/:id ─────────────────────────────────────────
export async function updatePricing(req, res, next) {
  try {
    const plan = await Pricing.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found.' });

    const errResp = validatePricingFields(req.body, res);
    if (errResp) return;

    const allowed = ['name', 'label', 'pricePaise', 'originalPricePaise', 'isEnabled', 'badge', 'description', 'sortOrder', 'durationDays'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.originalPricePaise === null) updates.originalPricePaise = null;
    if (req.body.durationDays       === null) updates.durationDays       = null;
    if (updates.pricePaise          !== undefined) updates.pricePaise    = Number(updates.pricePaise);
    if (updates.originalPricePaise  !== undefined && updates.originalPricePaise !== null)
      updates.originalPricePaise = Number(updates.originalPricePaise);
    if (updates.durationDays        !== undefined && updates.durationDays !== null)
      updates.durationDays = Number(updates.durationDays);

    const updated = await Pricing.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    console.log(`[ADMIN] Pricing plan updated: "${updated.name}" (${updated.planType})`);
    res.json(updated);
  } catch (err) { next(err); }
}

// ── DELETE /api/admin/pricing/:id ─────────────────────────────────────────
export async function deletePricing(req, res, next) {
  try {
    const plan = await Pricing.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found.' });

    // Prevent deleting the last active plan
    if (plan.isEnabled) {
      const activeCount = await Pricing.countDocuments({ isEnabled: true });
      if (activeCount <= 1)
        return res.status(400).json({ message: 'Cannot delete the last active plan. Disable it first or enable another plan.' });
    }

    await Pricing.findByIdAndDelete(req.params.id);
    console.log(`[ADMIN] Pricing plan deleted: "${plan.name}" (${plan.planType})`);
    res.json({ message: `Plan "${plan.name}" deleted.` });
  } catch (err) { next(err); }
}

// ── POST /api/admin/pricing/reset-defaults ───────────────────────────────
export async function resetPricingDefaults(req, res, next) {
  try {
    for (const defaults of PRICING_DEFAULTS) {
      await Pricing.findOneAndUpdate(
        { planType: defaults.planType },
        { $set: defaults },
        { upsert: true, new: true }
      );
    }
    const plans = await Pricing.find().sort({ sortOrder: 1, createdAt: 1 });
    res.json({ message: 'Pricing reset to defaults.', plans });
  } catch (err) { next(err); }
}

// ── GET /api/admin/pricing/revenue-by-plan ───────────────────────────────
// Revenue breakdown by plan type (for the stats section in the pricing tab)
export async function revenueByPlan(req, res, next) {
  try {
    const breakdown = await Payment.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id:        '$planType',
          totalPaise: { $sum: '$amountPaise' },
          count:      { $sum: 1 },
          avgPaise:   { $avg: '$amountPaise' },
        },
      },
      { $sort: { totalPaise: -1 } },
    ]);

    // Also grab total lifetime transactions for context
    const lifetimeCount = await Payment.countDocuments({ status: 'paid' });

    res.json({
      breakdown: breakdown.map(b => ({
        planType:   b._id ?? 'lifetime',
        totalINR:   (b.totalPaise / 100).toFixed(2),
        count:      b.count,
        avgINR:     (b.avgPaise / 100).toFixed(2),
      })),
      totalTransactions: lifetimeCount,
    });
  } catch (err) { next(err); }
}