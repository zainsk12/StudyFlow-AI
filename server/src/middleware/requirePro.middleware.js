// server/src/middleware/requirePro.middleware.js
import User from '../models/User.js';

/**
 * requirePro — must be used AFTER the `protect` middleware.
 *
 * Checks isPro AND subscription expiry from DB (source of truth).
 * Expired timed plans are treated as non-Pro and trigger a DB downgrade.
 */
export async function requirePro(req, res, next) {
  try {
    const user = await User.findById(req.userId)
      .select('isPro planType subscriptionExpiresAt')
      .lean();

    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    if (!user.isPro) {
      return res.status(403).json({ message: 'Pro subscription required.', code: 'PRO_REQUIRED' });
    }

    // Lifetime plan: subscriptionExpiresAt is null — never expires.
    if (user.planType === 'lifetime' || !user.subscriptionExpiresAt) {
      return next();
    }

    // Timed plan: check expiry
    if (new Date() > new Date(user.subscriptionExpiresAt)) {
      // Downgrade in DB — fire-and-forget
      User.findByIdAndUpdate(req.userId, {
        $set: {
          isPro:                 false,
          planType:              null,
          subscriptionExpiresAt: null,
          paidAt:                null,
          paymentId:             null,
        },
      }).catch(err =>
        console.error('[requirePro] Failed to downgrade expired subscription:', err.message)
      );

      return res.status(403).json({
        message: 'Your subscription has expired. Please renew to continue.',
        code: 'SUBSCRIPTION_EXPIRED',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}