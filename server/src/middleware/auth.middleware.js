import jwt  from 'jsonwebtoken';
import User from '../models/User.js';

// Cache stores: userId -> { tv, isPro, planType, subscriptionExpiresAt, at }
// Merging subscription fields into the same cache avoids a second DB round-trip.
const USER_CACHE    = new Map();
const CACHE_TTL_MS  = 60_000;   // 60 seconds
const MAX_CACHE_SIZE = 10_000;

// Periodic sweep: remove all expired entries every 5 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of USER_CACHE) {
    if (now - val.at >= CACHE_TTL_MS) USER_CACHE.delete(key);
  }
}, 5 * 60_000).unref();

async function getUserEntry(userId) {
  const cached = USER_CACHE.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;

  const user = await User.findById(userId)
    .select('tokenVersion isPro planType subscriptionExpiresAt')
    .lean();
  if (!user) return null;

  if (USER_CACHE.size >= MAX_CACHE_SIZE) {
    USER_CACHE.delete(USER_CACHE.keys().next().value);
  }

  const entry = {
    tv:                    user.tokenVersion,
    isPro:                 user.isPro,
    planType:              user.planType ?? null,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    at:                    Date.now(),
  };
  USER_CACHE.set(userId, entry);
  return entry;
}

// Call this to force-evict a user from the cache (e.g. after logout or plan change).
export function invalidateUserCache(userId) {
  USER_CACHE.delete(String(userId));
}

export const protect = async (req, res, next) => {
  try {
    let token = req.cookies?.sf_token;

    if (!token) {
      return res.status(401).json({ message: 'Not authorised — no token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const entry = await getUserEntry(decoded.id);
    if (entry === null) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (decoded.tv !== entry.tv) {
      USER_CACHE.delete(decoded.id);
      return res.status(401).json({ message: 'Session expired — please log in again' });
    }

    // ── Subscription expiry check ─────────────────────────────────────────
    // Lifetime plan: subscriptionExpiresAt is null — never expires.
    // Monthly/yearly: auto-downgrade if expiry has passed.
    if (
      entry.isPro &&
      entry.planType !== 'lifetime' &&
      entry.subscriptionExpiresAt !== null &&
      new Date() > new Date(entry.subscriptionExpiresAt)
    ) {
      // Evict cache so next request re-reads the updated state.
      USER_CACHE.delete(decoded.id);

      // Fire-and-forget DB downgrade — errors are logged but don't block the request.
      User.findByIdAndUpdate(decoded.id, {
        $set: {
          isPro:                 false,
          planType:              null,
          subscriptionExpiresAt: null,
          paidAt:                null,
          paymentId:             null,
        },
      }).catch(err =>
        console.error('[Auth] Failed to downgrade expired subscription:', err.message)
      );
    }

    req.userId = decoded.id;
    next();
  } catch (err) {
    next(err);
  }
};