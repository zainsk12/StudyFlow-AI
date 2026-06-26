import "dotenv/config";

import express  from "express";
import cors     from "cors";
import helmet   from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import { fileURLToPath } from "url";
import { dirname, join }       from "path";
import { readFileSync, existsSync }  from "fs";
import { connectDB }     from "../config/db.js";

import aiRoutes            from "./routes/ai.routes.js";
import scheduleRoutes      from "./routes/schedule.routes.js";
import subjectRoutes       from "./routes/subject.routes.js";
import authRoutes          from "./routes/auth.routes.js";
import syllabusRoutes      from "./routes/syllabus.routes.js";
import paymentRoutes       from "./routes/payment.routes.js";
import { validatePaymentConfig } from "./controllers/payment.controller.js";
import adminRoutes         from "./routes/admin.routes.js";
import { matchAdminSecret, hasAdminConfig } from "./middleware/admin.middleware.js";
import { adminPanelLimiter } from "./middleware/rateLimiter.js";
import cancellationRoutes  from "./routes/cancellation.routes.js";
import { errorHandler }    from "./middleware/errorHandler.js";
import { rateLimiter }     from "./middleware/rateLimiter.js";
import { requestLogger }   from "./middleware/requestLogger.js";
import cookieParser        from "cookie-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
connectDB();
const PORT = process.env.PORT || 5000;
const isDev = process.env.NODE_ENV !== 'production';

// ── Trust proxy (task 0.3) ─────────────────────────────────────────────────
// In production the app runs behind a TLS-terminating proxy / load balancer.
// Express must trust it so that:
//   • req.secure / X-Forwarded-Proto are honoured, and
//   • express-rate-limit keys on the real client IP (X-Forwarded-For) instead
//     of the single proxy IP (which would bucket all users together).
// Default: trust the first hop in production, off in dev. Override with
// TRUST_PROXY (a number of hops, "true"/"false", or an IP/subnet list).
if (process.env.TRUST_PROXY !== undefined) {
  const tp = process.env.TRUST_PROXY.trim();
  app.set('trust proxy',
    /^\d+$/.test(tp) ? Number(tp) :
    tp === 'true'    ? true :
    tp === 'false'   ? false :
    tp);
} else if (!isDev) {
  app.set('trust proxy', 1);
}

// ── Production env sanity check (task 0.5) ─────────────────────────────────
// Warn loudly (but don't crash) when recommended production variables are
// missing. MONGO_URI is enforced separately by connectDB(); ALLOWED_ORIGINS
// matters because without it CORS falls back to localhost and blocks the
// real client domain.
if (!isDev) {
  const recommended = ['MONGO_URI', 'JWT_SECRET', 'ALLOWED_ORIGINS'];
  const missing = recommended.filter((k) => !process.env[k]);
  if (missing.length) {
    console.warn(`[ENV] Missing recommended production variables: ${missing.join(', ')}`);
  }
}

function getAllowedOrigins() {
  // An explicit allowlist always wins — this is the production path (task 3.1).
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
  }

  // No explicit list configured. The localhost dev defaults are added ONLY in
  // development so production never silently trusts localhost; in production an
  // unset ALLOWED_ORIGINS yields just CLIENT_URL/ADMIN_PANEL_URL (if provided),
  // and the startup env check above already warns when it's missing.
  const origins = new Set();
  if (isDev) {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:5000');
  }

  if (process.env.CLIENT_URL)      origins.add(process.env.CLIENT_URL);
  if (process.env.ADMIN_PANEL_URL) origins.add(process.env.ADMIN_PANEL_URL);

  return [...origins];
}

// ── Helmet + Content-Security-Policy (task 0.4) ────────────────────────────
// CSP is tuned for the React SPA served same-origin (task 0.2):
//   • scripts: 'self' only (Vite emits external hashed bundles) + the Razorpay
//     Checkout SDK. No 'unsafe-inline' for scripts — the SPA has no inline JS.
//   • styles: 'unsafe-inline' is required because the UI uses inline style={{}}
//     attributes throughout (React/Recharts); Google Fonts stylesheet allowed.
//   • Razorpay needs its CDN/API for script, frame (checkout iframe), connect
//     (telemetry/API) and images.
// The /admin-panel route relaxes this per-response (it is a trusted single-file
// tool with inline scripts/handlers) — see that handler below.
const cspDirectives = {
  defaultSrc:  ["'self'"],
  baseUri:     ["'self'"],
  objectSrc:   ["'none'"],
  frameAncestors: ["'self'"],
  formAction:  ["'self'"],
  scriptSrc:     ["'self'", "https://checkout.razorpay.com"],
  scriptSrcAttr: ["'none'"],
  styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc:     ["'self'", "https://fonts.gstatic.com", "data:"],
  imgSrc:      ["'self'", "data:", "https://*.razorpay.com"],
  frameSrc:    ["'self'", "https://*.razorpay.com"],
  connectSrc:  ["'self'", "https://*.razorpay.com"],
};
// Force HTTPS upgrades in production only. In dev, explicitly disable the
// directive (helmet's useDefaults would otherwise add it) so that opening the
// server origin over http://localhost doesn't upgrade same-origin /api calls.
cspDirectives.upgradeInsecureRequests = isDev ? null : [];

app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: cspDirectives },
  // Razorpay's checkout iframe + Google Fonts are cross-origin embeds; COEP off
  // (helmet's default) keeps them working. Set explicitly for clarity.
  crossOriginEmbedderPolicy: false,
}));
app.use(cookieParser());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    if (!origin) return callback(null, true);
    if (origin === 'null') {
      if (isDev) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    }
    if (allowed.includes(origin)) return callback(null, true);
    if (isDev && /^http:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));

app.use("/api/payment",  paymentRoutes);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(mongoSanitize()); // strips keys starting with $ from req.body, req.query, req.params

app.use(requestLogger);
app.use(rateLimiter);

app.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.use("/api/ai",            aiRoutes);
app.use("/api/schedule",      scheduleRoutes);
app.use("/api/subjects",      subjectRoutes);
app.use("/api/auth",          authRoutes);
app.use("/api/syllabus",      syllabusRoutes);
app.use("/api/admin",         adminRoutes);
app.use("/api/cancellation",  cancellationRoutes);

let adminPanelHtml = null;
try {
  adminPanelHtml = readFileSync(
    join(__dirname, '../admin-panel.html'),
    'utf8'
  );
} catch {
  console.warn('[AdminPanel] admin-panel.html not found — /admin-panel route will return 404.');
}

app.get('/admin-panel', adminPanelLimiter, (req, res) => {
  if (!hasAdminConfig()) return res.status(404).send('Not found.');

  // Read secret from HTTP Basic Auth (Authorization: Basic base64(user:password))
  // The admin enters any username + a configured admin secret as the password.
  // matchAdminSecret performs a constant-time check against all configured
  // admin credentials (single ADMIN_SECRET and/or per-admin ADMIN_SECRETS).
  const authHeader = req.headers.authorization ?? '';
  let authorized = false;
  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded  = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      // username:password — everything after the first colon is the password
      const password = decoded.slice(decoded.indexOf(':') + 1);
      authorized = matchAdminSecret(password) !== null;
    } catch { authorized = false; }
  }

  if (!authorized) {
    return res
      .status(401)
      .setHeader('WWW-Authenticate', 'Basic realm="StudyFlow Admin", charset="UTF-8"')
      .setHeader('Cache-Control', 'no-store')
      .send('Unauthorized');
  }

  if (!adminPanelHtml) return res.status(404).send('Admin panel not available.');

  // Route-scoped CSP (task 0.4): the admin panel is a single trusted file that
  // uses inline <script>, inline on* handlers and inline <style>, so it needs a
  // looser policy than the global SPA one. It still calls only its own origin
  // (connect-src 'self') and blocks objects/plugins. This override replaces the
  // strict global CSP set by helmet for this response only.
  res
    .setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "script-src-attr 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self'; " +
      "font-src 'self' data:; " +
      "object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
    .setHeader('Content-Type', 'text/html')
    .setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    .setHeader('Pragma', 'no-cache')
    .send(adminPanelHtml);
});

// ── Serve the built React SPA, same-origin (tasks 0.1 / 0.2) ───────────────
// Production model: Express serves client/dist and the SPA calls the API via
// relative /api/* on the same origin. In development this block is inert — the
// client runs on Vite (port 3000) and proxies /api here — because no build
// exists at client/dist. Mounted AFTER all /api routes and the /admin-panel
// route, and BEFORE the JSON 404 so unknown /api routes still 404 as JSON.
const clientDist = join(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  // Hashed asset files (…/assets/*.[hash].js|css) are immutable → cache hard.
  // index.html is served no-cache so new deploys are picked up immediately.
  app.use(express.static(clientDist, {
    index: false,
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  // SPA history fallback: any non-API GET returns index.html so client-side
  // routing works on hard refresh and deep links.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(clientDist, 'index.html'));
  });

  console.log('[SPA] Serving client build from client/dist');
} else if (!isDev) {
  console.warn('[SPA] client/dist not found — run `npm run build` in client/ before starting in production.');
}

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

// ── Payment configuration validation (tasks 1.1 / 1.2) ─────────────────────
// Runs before the port is bound. Logs the Razorpay key mode (never the secret).
// In production a fatal finding (test/unknown keys, or missing key/webhook
// secret) refuses to start, guaranteeing prod never runs on test keys or an
// unconfigured webhook. In development these are advisory warnings only.
{
  const { mode, fatal, warnings } = validatePaymentConfig({ isProd: !isDev });
  warnings.forEach((w) => console.warn(`[Payment] ${w}`));
  if (fatal.length) {
    fatal.forEach((f) => console.error(`[Payment] CRITICAL: ${f}`));
    if (!isDev) {
      console.error('[Payment] Refusing to start in production with an invalid payment configuration. Fix the variables above and restart.');
      process.exit(1);
    }
  }
  console.log(`[Payment] Razorpay mode: ${mode.toUpperCase()}`);
}

app.listen(PORT, () => {
  console.log(`\n🚀  StudyFlow AI server running on http://localhost:${PORT}\n`);
  console.log(`[CORS] Allowed origins: ${getAllowedOrigins().join(', ')}\n`);

  if (adminPanelHtml && process.env.ADMIN_SECRET) {
    console.log(`[AdminPanel] Available at: http://localhost:${PORT}/admin-panel\n`);
  }
});

export default app;