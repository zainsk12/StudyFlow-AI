import { timingSafeEqual } from 'crypto';

/**
 * Admin guard middleware.
 * All /api/admin routes require the request to carry:
 *   x-admin-secret: <value of ADMIN_SECRET env var>
 *
 * Set ADMIN_SECRET to a long random string in server/.env.
 * The standalone admin panel sends this header automatically.
 */
export function adminGuard(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error('ADMIN_SECRET is not set in environment variables!');
    return res.status(500).json({ message: 'Admin access is not configured.' });
  }

  const provided = req.headers['x-admin-secret'] ?? '';

  // timingSafeEqual requires same-length buffers; unequal lengths are a safe
  // early-exit because the secret length is not itself sensitive here.
  let secretsMatch = false;
  try {
    const sBuf = Buffer.from(secret);
    const pBuf = Buffer.from(provided);
    secretsMatch = sBuf.length === pBuf.length && timingSafeEqual(sBuf, pBuf);
  } catch {
    secretsMatch = false;
  }

  if (!secretsMatch) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  next();
}