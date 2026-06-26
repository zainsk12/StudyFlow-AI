import { timingSafeEqual } from 'crypto';

/**
 * Admin guard middleware (roadmap task 3.2).
 *
 * All /api/admin routes require the request to carry:
 *   x-admin-secret: <a configured admin secret>
 *
 * Per-admin identities (backward compatible):
 *   • ADMIN_SECRETS="alice:secretA,bob:secretB"  → named per-admin secrets.
 *   • ADMIN_SECRET="<secret>"                     → single shared secret, always
 *     accepted under the identity "admin".
 * Both may be set together; ADMIN_SECRETS entries plus the bare ADMIN_SECRET are
 * all valid. The matched identity is exposed as req.adminName and recorded in an
 * audit log for every state-changing (non-GET) admin action.
 */

// Parse configured admin credentials into [{ name, secret }].
function getAdminCredentials() {
  const creds = [];
  if (process.env.ADMIN_SECRETS) {
    for (const pair of process.env.ADMIN_SECRETS.split(',')) {
      const idx = pair.indexOf(':');
      if (idx > 0) {
        const name   = pair.slice(0, idx).trim();
        const secret = pair.slice(idx + 1).trim();
        if (name && secret) creds.push({ name, secret });
      }
    }
  }
  if (process.env.ADMIN_SECRET) {
    creds.push({ name: 'admin', secret: process.env.ADMIN_SECRET });
  }
  return creds;
}

// True when at least one admin credential is configured.
export function hasAdminConfig() {
  return getAdminCredentials().length > 0;
}

// Constant-time equality that tolerates unequal lengths (length is not secret).
function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

/**
 * Match a provided secret against every configured admin credential.
 * Always checks all candidates (no early return) to avoid leaking which/how
 * many secrets exist via timing. Returns the matched admin name, or null.
 */
export function matchAdminSecret(provided) {
  if (typeof provided !== 'string' || provided.length === 0) return null;
  let matched = null;
  for (const c of getAdminCredentials()) {
    if (safeEqual(provided, c.secret)) matched = c.name;
  }
  return matched;
}

export function adminGuard(req, res, next) {
  if (!hasAdminConfig()) {
    console.error('Admin access is not configured (set ADMIN_SECRET or ADMIN_SECRETS).');
    return res.status(500).json({ message: 'Admin access is not configured.' });
  }

  const provided = req.headers['x-admin-secret'] ?? '';
  const adminName = matchAdminSecret(provided);

  if (!adminName) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  req.adminName = adminName;

  // Audit trail: log every state-changing admin action (GETs are read-only and
  // would only add noise). Structured one-line JSON for log aggregation.
  if (req.method !== 'GET') {
    console.log(JSON.stringify({
      ts:     new Date().toISOString(),
      type:   'admin_audit',
      admin:  adminName,
      method: req.method,
      path:   req.originalUrl,
      ip:     req.ip,
    }));
  }

  next();
}
