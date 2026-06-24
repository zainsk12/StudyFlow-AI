import "dotenv/config";

import express  from "express";
import cors     from "cors";
import helmet   from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import { fileURLToPath } from "url";
import { timingSafeEqual } from "crypto";
import { dirname, join }       from "path";
import { readFileSync }  from "fs";
import { connectDB }     from "../config/db.js";

import aiRoutes            from "./routes/ai.routes.js";
import scheduleRoutes      from "./routes/schedule.routes.js";
import subjectRoutes       from "./routes/subject.routes.js";
import authRoutes          from "./routes/auth.routes.js";
import syllabusRoutes      from "./routes/syllabus.routes.js";
import paymentRoutes       from "./routes/payment.routes.js";
import adminRoutes         from "./routes/admin.routes.js";
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

function getAllowedOrigins() {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
  }

  const origins = new Set([
    'http://localhost:3000',
    'http://localhost:5000',
  ]);

  if (process.env.CLIENT_URL)      origins.add(process.env.CLIENT_URL);
  if (process.env.ADMIN_PANEL_URL) origins.add(process.env.ADMIN_PANEL_URL);

  return [...origins];
}

app.use(helmet());
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

app.get('/admin-panel', (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(404).send('Not found.');

  // Read secret from HTTP Basic Auth (Authorization: Basic base64(user:password))
  // The admin enters any username + the ADMIN_SECRET as the password.
  const authHeader = req.headers.authorization ?? '';
  let authorized = false;
  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded  = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      // username:password — everything after the first colon is the password
      const password = decoded.slice(decoded.indexOf(':') + 1);
      const sBuf = Buffer.from(secret);
      const pBuf = Buffer.from(password);
      authorized = sBuf.length === pBuf.length && timingSafeEqual(sBuf, pBuf);
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

  res
    .setHeader('Content-Type', 'text/html')
    .setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    .setHeader('Pragma', 'no-cache')
    .send(adminPanelHtml);
});

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

const WEBHOOK_SECRET_PLACEHOLDER = 'replace_this_with_your_razorpay_webhook_secret';

app.listen(PORT, () => {
  console.log(`\n🚀  StudyFlow AI server running on http://localhost:${PORT}\n`);
  console.log(`[CORS] Allowed origins: ${getAllowedOrigins().join(', ')}\n`);

  // Warn loudly if webhook secret is missing — Pro access won't auto-grant via webhook.
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret === WEBHOOK_SECRET_PLACEHOLDER) {
    console.error(
      '\n⚠️  [Payment] RAZORPAY_WEBHOOK_SECRET is not configured!\n' +
      '   Webhook events will be rejected and Pro access will NOT be\n' +
      '   auto-granted after payment. Set this in server/.env NOW.\n'
    );
  }

  if (adminPanelHtml && process.env.ADMIN_SECRET) {
    console.log(`[AdminPanel] Available at: http://localhost:${PORT}/admin-panel\n`);
  }
});

export default app;