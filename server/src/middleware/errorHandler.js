/**
 * Global error handler.
 *
 * All responses from this middleware use a consistent envelope:
 *   { message: string, code?: string, reqId?: string }
 *
 * In development the raw stack is also included.
 *
 * Normalizes:
 *   - Razorpay SDK errors  { statusCode, error.description }
 *   - Mongoose validation  err.name === 'ValidationError'
 *   - Mongoose cast error  err.name === 'CastError'  (bad ObjectId)
 *   - Mongoose duplicate   err.code === 11000
 *   - JWT errors           err.name === 'JsonWebTokenError' | 'TokenExpiredError'
 *   - Generic JS errors    err.status | err.statusCode | 500
 */

const isDev = process.env.NODE_ENV !== 'production';

function logError(req, status, message, stack) {
  if (isDev) {
    console.error(`[ERROR] ${status} — ${message}${req?.reqId ? ` [${req.reqId}]` : ''}`);
    if (stack) console.error(stack);
  } else {
    console.error(JSON.stringify({
      ts:     new Date().toISOString(),
      level:  'error',
      type:   'error',
      status,
      message,
      reqId:  req?.reqId  ?? null,
      url:    req?.originalUrl ?? null,
      method: req?.method ?? null,
    }));
  }
}

function send(res, status, message, code, req, stack) {
  logError(req, status, message, isDev ? stack : null);
  res.status(status).json({
    message,
    ...(code  && { code }),
    ...(req?.reqId && { reqId: req.reqId }),
    ...(isDev && stack && { stack }),
  });
}

export function errorHandler(err, req, res, _next) {
  // ── Razorpay SDK ────────────────────────────────────────────────────────
  if (err.error?.description) {
    return send(res, err.statusCode || 400, err.error.description, 'RAZORPAY_ERROR', req, err.stack);
  }

  // ── Mongoose validation error ───────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(e => e.message).join('. ');
    return send(res, 400, message, 'VALIDATION_ERROR', req, err.stack);
  }

  // ── Mongoose bad ObjectId ───────────────────────────────────────────────
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return send(res, 400, 'Invalid ID format.', 'INVALID_ID', req, err.stack);
  }

  // ── Mongoose duplicate key ──────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    return send(res, 409, `${field} already exists.`, 'DUPLICATE_KEY', req, err.stack);
  }

  // ── JWT errors ──────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    return send(res, 401, 'Invalid token.', 'INVALID_TOKEN', req, err.stack);
  }
  if (err.name === 'TokenExpiredError') {
    return send(res, 401, 'Token expired.', 'TOKEN_EXPIRED', req, err.stack);
  }

  // ── Generic ─────────────────────────────────────────────────────────────
  const status = err.status || err.statusCode || 500;

  // Never leak internal error text for 5xx in production.
  const message =
    isDev
      ? (err.message || 'Internal server error')
      : (status < 500 ? err.message : 'Internal server error');

  send(res, status, message, err.code ?? undefined, req, err.stack);
}