import { randomUUID } from 'crypto';

const isDev = process.env.NODE_ENV !== 'production';

// Query-param keys whose values must never appear in logs. This also protects
// credentials if a client accidentally puts them in a URL.
const REDACTED_PARAMS = new Set(['secret', 'token', 'api_key', 'key', 'password', 'apikey']);

function redactUrl(rawUrl) {
  try {
    // URL() requires an absolute URL — use a throwaway base
    const u = new URL(rawUrl, 'http://x');
    let changed = false;
    for (const key of REDACTED_PARAMS) {
      if (u.searchParams.has(key)) {
        u.searchParams.set(key, '[REDACTED]');
        changed = true;
      }
    }
    if (!changed) return rawUrl;
    return u.pathname + u.search;
  } catch {
    return rawUrl;
  }
}

export function requestLogger(req, res, next) {
  const reqId = randomUUID();
  req.reqId   = reqId;
  res.setHeader('X-Request-Id', reqId);

  const start      = Date.now();
  const safeUrl    = redactUrl(req.originalUrl);

  res.on('finish', () => {
    const ms     = Date.now() - start;
    const status = res.statusCode;

    if (isDev) {
      const color =
        status >= 500 ? '\x1b[31m' :
        status >= 400 ? '\x1b[33m' :
        status >= 300 ? '\x1b[36m' :
                        '\x1b[32m';
      const reset = '\x1b[0m';
      console.log(
        `${color}${req.method}${reset} ${safeUrl} → ${color}${status}${reset} (${ms}ms) [${reqId}]`
      );
    } else {
      console.log(JSON.stringify({
        ts:     new Date().toISOString(),
        level:  status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        type:   'request',
        method: req.method,
        url:    safeUrl,
        status,
        ms,
        reqId,
        ip:     req.ip,
        ua:     req.get('user-agent') ?? '',
      }));
    }
  });

  next();
}
