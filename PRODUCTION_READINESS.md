# Production Readiness Audit — StudyFlow AI

> Audit date: 2026-06-24. Target: production deployment used by thousands of students.
> Status legend: ✅ ready · ⚠️ partial / risky · ❌ missing / blocker.

---

## 1. Environment Setup — ❌ Blocker

- ❌ Real secrets live in `server/.env`; no `.env.example` despite README references. See SECURITY_AUDIT §1.
- ❌ Shipped `NODE_ENV=development` (`server/.env:1`). In dev mode: CORS allows `localhost:*` + `origin:'null'`, and the error handler leaks stack traces. Production must set `NODE_ENV=production`.
- ⚠️ No `engines` field, no root `start` script, no process manager config (PM2/systemd), no `Dockerfile`/compose. Deployment story is undefined.
- ⚠️ CORS allowlist relies on `ALLOWED_ORIGINS`/`CLIENT_URL` env (`app.js:34`) — workable, but undocumented for prod.
- ⚠️ Client talks to the API via a same-origin `/api` Vite **dev** proxy (`vite.config.js`). For production you must serve the built SPA and reverse-proxy `/api` to Express (or set an absolute API base) — no production serving config exists.

## 2. Logging — ⚠️ Partial

- ✅ `requestLogger` emits structured JSON in prod (method, url, status, ms, reqId, ip, ua) with secret redaction; pretty colored logs in dev.
- ✅ `errorHandler` logs structured errors with reqId.
- ⚠️ Everything goes to `console` only — no log shipping/aggregation, no log levels config, no rotation. `console.log` is used for important events (payments, admin actions) mixed with the structured logger.
- ⚠️ Several silent `.catch(()=>{})` swallow failures with no log/metric (cache evict, plan push, aiMessageCount).

## 3. Monitoring & Health — ⚠️ Partial

- ✅ `GET /health` returns status + uptime.
- ❌ No readiness probe that checks DB connectivity; `/health` returns ok even if Mongo is down.
- ❌ No metrics (request rate, latency, error rate, payment success rate, AI spend) — no Prometheus/OpenTelemetry.
- ❌ No uptime/alerting integration.

## 4. Error Tracking — ❌ Missing

- ❌ No Sentry/Rollbar/equivalent on client or server. The client `ErrorBoundary` only `console.error`s. Frontend crashes and backend 5xx are invisible in production. For a payments product this is a blocker for operability.

## 5. Database Reliability — ⚠️ Risky

- ⚠️ `connectDB` does `process.exit(1)` on any connect error, no retry/backoff (`config/db.js`) — a transient Atlas blip at boot crashes the app.
- ✅ Useful indexes: `Subject.userId`, `StudyPlan.userId`, `CancellationRequest.userId`, unique `User.email`, unique `Coupon.code`, unique `Pricing.planType`.
- ⚠️ `Payment` has **no index** on `razorpayOrderId` or `userId`, yet `verifyPayment`/`handleWebhook` query by `razorpayOrderId` and admin queries by `userId` — these become collection scans as payments grow.
- ⚠️ No transactions around multi-doc payment updates (Payment + User + Coupon) — partial failures possible. No connection pool tuning.
- ❌ Coupon `usedCount` drifts (see BUG-4) — there's an admin "recalculate" tool, implying known data-integrity issues.

## 6. Scalability — ⚠️ Risky

- ❌ **In-memory rate limiter and user cache** (`rateLimiter.js`, `auth.middleware USER_CACHE`) and **in-memory** `setInterval` cache sweep — all per-process. Horizontal scaling breaks rate limiting and makes caches incoherent. Needs Redis.
- ⚠️ Full `StudyPlan` document (incl. `Mixed` subjects) rewritten on each debounced save — write amplification under load.
- ⚠️ `broadcastEmail` runs in-request for up to 500 recipients — should be a background job/queue.
- ⚠️ SSE syllabus endpoint holds a long-lived connection per import; with memory-buffered PDFs, concurrency pressures RAM.
- ✅ Stateless JWT auth (cookie) scales horizontally once caches/limits are externalised.

## 7. Deployment Readiness — ❌ Not ready

- ❌ No build/serve pipeline for the SPA in production; no static hosting/CDN config.
- ❌ No CI/CD, no Dockerfile, no infra-as-code.
- ❌ `npm run lint` is broken (no ESLint flat config) — no quality gate.
- ❌ Zero tests — no confidence gate for auth/payment regressions.
- ⚠️ `admin-panel.html` is served by the API server itself behind Basic auth; the `dev` script explicitly `--ignore`s it from nodemon — operationally awkward.

## 8. Backup & Disaster Recovery — ❌ Missing

- ❌ No documented backup strategy. Relies implicitly on MongoDB Atlas backups (must be enabled + verified). No export/restore runbook, no point-in-time recovery policy documented.
- ❌ No data-retention / deletion policy (relevant for student PII and GDPR-style requests). `deleteUser` exists but doesn't cascade `CancellationRequest` (BUG-27).

## 9. SEO — ❌ Not applicable / unaddressed

- ❌ SPA with a near-empty `index.html` (one `#root`), no meta description, OpenGraph, robots, sitemap, or SSR. There is no marketing/landing page — the root is the gated app. For a SaaS acquiring students via search, there is no SEO surface at all.

## 10. Accessibility — ⚠️ Poor

- ⚠️ Clickable `<div>`s with `onClick` used as buttons throughout (e.g. topic rows in `ProgressTab`, accordion headers, plan cards) — not keyboard-focusable, no `role`/`aria`.
- ⚠️ Icon-only buttons (close X, eye toggles, nav chevrons) frequently lack `aria-label`.
- ⚠️ Color is the primary state signal (difficulty, done/pending) with low-contrast dark palette; light theme is broken (BUG-20). No focus-visible styles.
- ⚠️ Global numeric keyboard shortcuts (BUG-21) interfere with assistive tech.
- ✅ Some `title`/`tabIndex={-1}` on inputs; password fields have show/hide.

## 11. Mobile Responsiveness — ❌ Blocker for a student app

- ❌ **Zero `@media` queries** in `global.css`. Fixed `maxWidth:960`, `repeat(4,1fr)` grids, and a non-wrapping header row (4 metrics + Pomodoro + avatar) overflow/squash on phones (BUG-19). Modals use fixed `maxWidth` but inner grids don't reflow. Given students are predominantly mobile, this alone blocks launch.

## 12. Performance Optimization — ⚠️ Partial

- ⚠️ All styling is inline JS objects (large per-render allocations) and the bundle ships Recharts + jspdf eagerly imported in components (jspdf is at least lazy-imported in `ExportPDFButton`; Recharts is not code-split).
- ⚠️ No memoisation on charts; `AuthContext` polls every 15s per tab.
- ⚠️ No HTTP caching headers / asset fingerprinting strategy documented (Vite handles hashing on build, but serving/CDN is undefined).
- ✅ `DayCard` is `React.memo`'d with `useCallback` handlers (good, deliberate optimisation).
- ✅ Server caps schedule input (50 subjects/200 topics) to bound CPU.

---

## Readiness Scorecard

| Area | Status |
|---|---|
| Secrets / env | ❌ Blocker |
| Logging | ⚠️ |
| Monitoring / health | ⚠️ |
| Error tracking | ❌ |
| DB reliability | ⚠️ |
| Scalability | ⚠️ |
| Deployment pipeline | ❌ |
| Tests / quality gate | ❌ |
| Backup / DR | ❌ |
| SEO | ❌ |
| Accessibility | ⚠️ |
| Mobile responsive | ❌ Blocker |
| Performance | ⚠️ |

**Verdict: NOT production-ready.** Hard blockers: leaked secrets, `NODE_ENV`/CORS/error-leak in prod, no responsive design, broken webhook (revenue), no error tracking, no tests, no deployment pipeline, in-memory state that breaks horizontal scaling.
