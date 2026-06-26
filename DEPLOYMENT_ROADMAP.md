# StudyFlow AI — Deployment Roadmap

**Generated:** 2026-06-26
**Status:** Single source of truth. Supersedes all prior audit documents.
**Scope:** Fresh audit of the current codebase. Completed work (security fixes, secret rotation, `.env.example`, JWT/admin hardening, OTP-bound password reset, AI Pro gating, responsive/theme overhaul, MongoDB DNS fix) has been verified and is **excluded** from this list.

---

## How to read this

Each task carries: Priority, Why, Files, Effort, Risk, Dependencies, **Blocks deployment?**, and **Optional after launch?**

- **Effort:** S (<1h), M (half-day), L (1–2 days), XL (3+ days)
- **Risk:** chance the change breaks something else if done carelessly.
- A task that **blocks deployment** must be resolved before the first production release.

### Verified-complete (do NOT re-do)
- `requirePro` now guards both `/api/ai/chat` and `/api/ai/regen-advice` (`ai.routes.js`).
- Password reset re-verifies the emailed OTP at the final step (`auth.controller.js → resetPassword`).
- `server/.env.example` contains placeholders only; real `server/.env` is gitignored.
- MongoDB SRV/`ECONNREFUSED` resolver guard is present in `server/config/db.js`.
- Webhook uses raw-body HMAC verification and is mounted before `express.json()` (`payment.routes.js`).
- Coupon `isValid`/`remainingUses` virtuals serialize correctly; PATCH validates `discountPct`.

---

## Phase 0 — Deployment Architecture Blockers (do first)

These are not bugs in isolation; they are the reason the app cannot currently run correctly anywhere except `localhost` with the Vite dev proxy.

### Task 0.1 — Decide & wire the client→API connection model for production
- **Priority:** Critical
- **Why:** Every client request uses a **relative** path (`fetch('/api/...')`) and relies on the Vite dev proxy (`vite.config.js`), which exists **only in `npm run dev`**. A production build has no proxy. `client/.env.example` documents `VITE_API_BASE_URL`, but **no source file reads `import.meta.env.VITE_API_BASE_URL`** — so the variable is dead. Without a decision here, the deployed SPA cannot reach the API.
- **Two viable models (pick one):**
  - **(A) Same-origin:** Express serves the built SPA (see 0.2). Relative paths keep working; simplest; cookies stay first-party.
  - **(B) Split hosting** (SPA on a static host, API on another domain): introduce a central `apiBase` helper reading `VITE_API_BASE_URL`, prefix all fetches, and complete tasks 0.3 + 3.1 (cross-site cookies + CORS).
- **Files:** `client/src/**` (all `fetch` call sites or a new `src/lib/api.js`), `client/vite.config.js`, `client/.env.example`
- **Effort:** M (A) / L (B) · **Risk:** Medium
- **Dependencies:** none · **Blocks deployment:** ✅ Yes · **Optional after launch:** No

### Task 0.2 — Serve the built React app from Express (only if Model A)
- **Priority:** Critical (if 0.1 = A)
- **Why:** `app.js` serves `admin-panel.html` but never serves the client `dist/`. Under same-origin hosting, the SPA must be served (with a history-API fallback to `index.html`) by Express.
- **Files:** `server/src/app.js`, root deploy scripts/`package.json`
- **Effort:** M · **Risk:** Medium (route ordering vs. `/api` and the 404 handler) · **Dependencies:** 0.1 · **Blocks deployment:** ✅ Yes (Model A) · **Optional after launch:** No

### Task 0.3 — Set `trust proxy` and finalize cookie attributes for HTTPS/proxy
- **Priority:** Critical
- **Why:** In production the app runs behind a TLS-terminating proxy/load balancer. Express is not told to trust it (`app.set('trust proxy', …)` is absent), so `req.ip` becomes the proxy IP — **`express-rate-limit` then keys every user to the same bucket** (global throttle or effective bypass) and may emit validation errors. Auth cookies are `sameSite:'strict'`; that is fine for same-origin but **blocks the cookie entirely on a split-host setup** (Model B needs `sameSite:'none'; secure:true`). `secure` is already gated on `NODE_ENV==='production'`.
- **Files:** `server/src/app.js`, `server/src/controllers/auth.controller.js` (`cookieOptions`)
- **Effort:** S · **Risk:** Medium (wrong `trust proxy` value affects rate-limit correctness) · **Dependencies:** 0.1 · **Blocks deployment:** ✅ Yes · **Optional after launch:** No

### Task 0.4 — Confirm Helmet CSP does not break the SPA or admin panel
- **Priority:** High
- **Why:** `helmet()` runs with default CSP. The SPA and especially `admin-panel.html` (single-file, inline `<script>`/`<style>`) will be blocked by a strict default `script-src 'self'`. This must be validated and a tailored CSP (or a scoped relaxation for `/admin-panel`) applied.
- **Files:** `server/src/app.js`, `server/admin-panel.html`
- **Effort:** M · **Risk:** Medium · **Dependencies:** 0.2 · **Blocks deployment:** ✅ Yes · **Optional after launch:** No

### Task 0.5 — Production environment & secret management
- **Priority:** Critical
- **Why:** `server/.env` currently holds **real, working credentials** (Mongo password, `JWT_SECRET`, Groq/Mistral keys, Gmail app password, Razorpay keys, `ADMIN_SECRET`). These have been viewed during troubleshooting sessions and must be treated as exposed. For production: rotate all of them again, inject via the platform secret manager (never ship a `.env`), set `NODE_ENV=production`, and set `ALLOWED_ORIGINS` to the real domain(s) — otherwise CORS falls back to `localhost` and the prod client is blocked.
- **Files:** deployment platform config only (no code)
- **Effort:** M · **Risk:** Low · **Dependencies:** 0.1 · **Blocks deployment:** ✅ Yes · **Optional after launch:** No

### Task 0.6 — Verify MongoDB SRV resolution on the production host
- **Priority:** High
- **Why:** The `db.js` DNS guard only overrides Node's resolver when it detects the broken `127.0.0.1` fallback (a local-Windows quirk). On a normal Linux host this is a no-op, which is correct — but it must be confirmed that the production host resolves the Atlas SRV record natively, and that the Atlas IP allowlist includes the production egress IP(s) (currently `0.0.0.0/0`, which should be tightened — see 3.5).
- **Files:** `server/config/db.js` (review only), Atlas network config
- **Effort:** S · **Risk:** Low · **Dependencies:** 0.5 · **Blocks deployment:** ✅ Yes · **Optional after launch:** No

---

## Phase 1 — Payment Go-Live Blockers

### Task 1.1 — Configure the Razorpay webhook secret
- **Priority:** Critical
- **Why:** `RAZORPAY_WEBHOOK_SECRET` is the placeholder `<new-razorpay-webhook-secret>`. `handleWebhook` **rejects all events** when it is unset (returns 500 `misconfigured`). The webhook is the reliable path that auto-grants Pro after `payment.captured`; without it, Pro depends solely on the synchronous `/verify` call, which is lost if the user closes the tab mid-redirect. The startup log already warns about this.
- **Files:** platform secret config; Razorpay dashboard (register endpoint + events `payment.captured`, `payment.failed`)
- **Effort:** S · **Risk:** Low · **Dependencies:** 0.5 · **Blocks deployment:** ✅ Yes · **Optional after launch:** No

### Task 1.2 — Switch Razorpay from test to live keys
- **Priority:** Critical
- **Why:** `RAZORPAY_KEY_ID` is `rzp_test_*`. Real payments require `rzp_live_*` keys and a fresh live webhook secret. Test keys silently accept no real money.
- **Files:** platform secret config; client picks `keyId` from the order response (no code change)
- **Effort:** S · **Risk:** Low · **Dependencies:** 1.1 · **Blocks deployment:** ✅ Yes · **Optional after launch:** No

### Task 1.3 — Fix purchase-confirmation email hardcoding "Lifetime Access"
- **Priority:** High
- **Why:** `sendPurchaseConfirmationEmail` always renders "Welcome to StudyFlow AI Pro — **Lifetime** Access", "Plan: Lifetime Access", and "lifetime access is now active" regardless of `planType`. Monthly/yearly buyers receive a factually wrong receipt — a support- and trust-impacting bug now that multi-plan pricing is live.
- **Files:** `server/src/utils/email.js`; callers pass `planType` (`payment.controller.js`)
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No (fix in first patch) · **Optional after launch:** No

---

## Phase 2 — Functional Bugs & Correctness

### Task 2.1 — Resolve the `/api/schedule/generate` Pro-gate inconsistency
- **Priority:** Medium
- **Why:** Plan generation actually happens **client-side for free** (`useStudyPlanner.generatePlan` → local `buildSchedule`). The server's `POST /api/schedule/generate` is `requirePro`-gated but is **never called by the client** (client only uses `GET`/`PUT /full`). This is dead, contradictory surface area: either it's a paywalled feature that's being given away client-side, or the endpoint should be removed. Decide and align.
- **Files:** `server/src/routes/schedule.routes.js`, `server/src/controllers/schedule.controller.js`, product decision on whether plan-generation is a Pro feature
- **Effort:** S–M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 2.2 — Call `invalidateUserCache` after Pro state changes
- **Priority:** Medium
- **Why:** `auth.middleware.js` exports `invalidateUserCache`, but **nothing calls it.** Admin `grantPro`/`revokePro`/`downgrade`/`extend`, self-cancel, and cancellation approval all change `isPro`/`planType` without evicting the 60s `USER_CACHE`. Access control itself is safe (`requirePro` reads the DB live), but the cached `protect` entry can drive a stale auto-expiry decision for up to 60s. Wire the eviction into those write paths.
- **Files:** `server/src/controllers/admin.controller.js`, `server/src/controllers/payment.controller.js`, `server/src/controllers/cancellation.controller.js`
- **Effort:** S · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 2.3 — Separate the shared OTP fields for "forgot password" vs "change password"
- **Priority:** Medium
- **Why:** `forgotPassword`, `sendPwdChangeOtp`, and `verifyOtp` all read/write the **same** `resetOtp`/`resetOtpExpiry`/`resetVerified` fields on the user. A user running an authenticated password change while a forgot-password email is outstanding (or vice-versa) can clobber one flow's code with the other's. Low frequency, but a real correctness edge. Give password-change its own OTP fields (mirroring the dedicated `cancelOtp` fields).
- **Files:** `server/src/models/User.js`, `server/src/controllers/auth.controller.js`
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 2.4 — Cross-device sync is last-write-wins by timestamp
- **Priority:** Medium
- **Why:** `useStudyPlanner` reconciles localStorage vs server via `pickNewerSource` (newest `savedAt` wins) and pushes the whole planner blob. Two devices editing concurrently → the later save silently overwrites the earlier one (lost topic toggles/edits). Acceptable for a single-device MVP; document the limitation and, if multi-device is a goal, move to field-level merge or server-authoritative writes.
- **Files:** `client/src/hooks/useStudyPlanner.js`, `server/src/controllers/schedule.controller.js`
- **Effort:** L · **Risk:** Medium · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

---

## Phase 3 — Security Hardening (remaining)

### Task 3.1 — Lock CORS to explicit production origins
- **Priority:** High
- **Why:** When `ALLOWED_ORIGINS` is unset, `getAllowedOrigins()` falls back to `localhost:3000/5000` and, in dev, reflexively allows any `localhost` origin and `origin: 'null'`. In production with `NODE_ENV=production` those dev branches are off, but the **must-set** `ALLOWED_ORIGINS` is the only thing standing between the credentialed cookie API and arbitrary origins. Tie this to 0.5 and verify it's enforced.
- **Files:** `server/src/app.js`, platform env
- **Effort:** S · **Risk:** Medium · **Dependencies:** 0.5 · **Blocks deployment:** ✅ Yes · **Optional after launch:** No

### Task 3.2 — Harden the admin authentication model
- **Priority:** Medium
- **Why:** All `/api/admin/*` access is a single shared static secret in an `x-admin-secret` header (timing-safe compared — good), and `/admin-panel` uses HTTP Basic with the same secret. There are no per-admin identities, no audit trail, and no admin-specific brute-force limiter (only the global 100/15min applies; `/api/admin` is mounted after the global limiter so it does inherit it). For a payments/admin surface, consider per-admin accounts, an action audit log, and a stricter dedicated limiter.
- **Files:** `server/src/middleware/admin.middleware.js`, `server/src/routes/admin.routes.js`, `server/src/app.js`
- **Effort:** L · **Risk:** Medium · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 3.3 — Confirm rate limit + file-size cap on the syllabus upload path
- **Priority:** Medium
- **Why:** AI chat/regen are well-limited (IP + per-user, 20/15min, Pro-gated). Verify `/api/syllabus/import` (Mistral, up to 80k chars/call, multipart upload) carries an equivalent per-user limiter and a Multer file-size cap; an unbounded PDF upload path is both a cost and a memory risk.
- **Files:** `server/src/routes/syllabus.routes.js`, `server/src/controllers/syllabus.controller.js`
- **Effort:** S–M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 3.4 — Reduce login/forgot-password user-enumeration & timing signal
- **Priority:** Low
- **Why:** `forgotPassword` correctly returns a generic message, but only does bcrypt/email work when the user exists, leaving a timing oracle. `login` returns a uniform "Invalid credentials." (good). Optional: normalize timing on the forgot path.
- **Files:** `server/src/controllers/auth.controller.js`
- **Effort:** S · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 3.5 — Tighten the Atlas IP allowlist
- **Priority:** Medium
- **Why:** The cluster allows `0.0.0.0/0`. Restrict to the production egress IP/CIDR (and your own admin IP) once hosting is chosen.
- **Files:** Atlas config (no code)
- **Effort:** S · **Risk:** Low · **Dependencies:** 0.5 · **Blocks deployment:** ❌ No (strongly recommended pre-launch) · **Optional after launch:** Yes

---

## Phase 4 — Data Integrity & Reliability

### Task 4.1 — Validate `StudyPlan.subjects` shape on write
- **Priority:** Medium
- **Why:** `subjects` is `Schema.Types.Mixed`. `saveFullPlan` checks array length/`name` presence but stores arbitrary nested topic objects untyped. A malformed client (or future bug) can persist junk that later breaks `behindCount`/stats math. Add server-side topic-shape validation (id, name, difficulty enum, status enum).
- **Files:** `server/src/controllers/schedule.controller.js`, optionally `server/src/models/StudyPlan.js`
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 4.2 — Reconcile orphaned `created` payments
- **Priority:** Low
- **Why:** Orders created but never captured remain `status:'created'` forever (abandoned checkouts). Not harmful, but they pollute admin queries/analytics. Add a periodic sweep or an admin "expire stale orders" action.
- **Files:** `server/src/controllers/payment.controller.js` (or a small scheduled job)
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 4.3 — Make the streak feature account-portable
- **Priority:** Low
- **Why:** Study streaks live only in `localStorage` (`sf_streak_<uid>`). They reset on a new device or cleared storage. If streaks are a retention feature, persist them server-side; otherwise document as device-local by design.
- **Files:** `client/src/hooks/useStudyPlanner.js`, optionally a server field
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

---

## Phase 5 — AI Quality

### Task 5.1 — Add resilience/fallback for AI provider outages
- **Priority:** Low
- **Why:** Chat/regen hardcode Groq `llama-3.3-70b-versatile`; syllabus uses Mistral `mistral-small-latest` (already has retry/repair). A provider outage surfaces as a generic 500. Consider a secondary model/provider or a clearer degraded-mode message, and centralize the model name in config.
- **Files:** `server/src/controllers/ai.controller.js`, `server/src/controllers/syllabus.controller.js`
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 5.2 — Bound the size of AI context payloads
- **Priority:** Low
- **Why:** `chatWithAI` interpolates the full subject summary into the system prompt; a very large plan inflates tokens/cost. Cap the number of subjects/topics summarized.
- **Files:** `server/src/controllers/ai.controller.js`
- **Effort:** S · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

---

## Phase 6 — Performance & Scaling

### Task 6.1 — Replace in-memory caches/limiters before horizontal scaling
- **Priority:** Medium (only if running >1 instance)
- **Why:** `USER_CACHE` (auth) and the default `express-rate-limit` store are per-process in-memory. With multiple instances behind a load balancer, the cache is inconsistent and rate limits are per-instance (N× the intended ceiling). Move to a shared store (e.g. Redis) when scaling out. Single instance: fine as-is.
- **Files:** `server/src/middleware/auth.middleware.js`, `server/src/middleware/rateLimiter.js`
- **Effort:** L · **Risk:** Medium · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 6.2 — Review indexes for admin query growth
- **Priority:** Low
- **Why:** Admin user search uses unanchored `$regex` on name/email (collection scan) and Payment aggregations scan by `status`/`planType`. Fine at small scale; add indexes (`status`, `planType`, `couponCode`) and reconsider search as data grows.
- **Files:** `server/src/models/Payment.js`, `server/src/models/User.js`
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

---

## Phase 7 — Code Quality & Cleanup

### Task 7.1 — Remove superseded audit markdown files
- **Priority:** Medium
- **Why:** The repo root still contains `MASTER_AUDIT_REPORT.md`, `SECURITY_AUDIT.md`, `BUG_REPORT.md`, `CODE_QUALITY_AUDIT.md`, `PRODUCTION_READINESS.md`, `PRODUCT_REVIEW.md`, and `PROJECT_OVERVIEW.md`. They describe a stale state and contradict this single source of truth. Delete them (keep `README.md` and this file).
- **Files:** repo-root `*.md` (deletion only)
- **Effort:** S · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 7.2 — Remove dead/legacy server surface
- **Priority:** Low
- **Why:** `GET /api/schedule` and `POST /api/schedule/generate` are not consumed by the client (it persists via `/full`). The exported `invalidateUserCache` is unused (until 2.2 wires it). Trim or repurpose to reduce confusion and attack surface.
- **Files:** `server/src/routes/schedule.routes.js`, `server/src/controllers/schedule.controller.js`, `server/src/middleware/auth.middleware.js`
- **Effort:** S · **Risk:** Low · **Dependencies:** 2.1, 2.2 · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 7.3 — Gate operational `console.log` noise behind the logger/NODE_ENV
- **Priority:** Low
- **Why:** ~21 `console.log`/`console.error` calls across controllers/utils (webhook, admin actions, email "✅" lines). Useful, but unstructured and noisy in production. Route through a leveled logger and suppress success chatter when `NODE_ENV==='production'` (the `errorHandler` already does structured JSON — extend that pattern).
- **Files:** `server/src/controllers/*`, `server/src/utils/email.js`, `server/src/middleware/requestLogger.js`
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 7.4 — Align auth-page inline colors with the theme tokens
- **Priority:** Low
- **Why:** Auth pages (`LoginPage.jsx`, `SignupPage.jsx`) still use hardcoded hex in their local `s` style objects (they predate the theme-token migration). They render only in dark mode, so they're consistent today, but if light-mode is ever extended to the auth screens they'll be wrong. Cosmetic debt, not a bug.
- **Files:** `client/src/pages/LoginPage.jsx`, `client/src/pages/SignupPage.jsx`
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

---

## Phase 8 — Nice-to-Have / Post-Launch

### Task 8.1 — Introduce an automated test suite
- **Priority:** Medium (process), Low (for first launch)
- **Why:** There are zero automated tests. The highest-value targets are payment verify/webhook signature logic, coupon math, OTP flows, and `requirePro`/expiry. A thin integration suite would catch regressions in exactly the money/auth paths that matter most.
- **Files:** new `server/test/**` (+ test runner in `server/package.json`)
- **Effort:** XL · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 8.2 — Move transactional email off raw Gmail SMTP
- **Priority:** Low
- **Why:** Nodemailer→Gmail works but has low daily send caps and weaker deliverability (SPF/DKIM/DMARC) than a transactional provider. OTPs and receipts are deliverability-critical; the admin broadcast (capped at 500/call, batched 10) will hit Gmail limits as the user base grows.
- **Files:** `server/src/utils/email.js`, `server/src/controllers/admin.controller.js`
- **Effort:** M · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 8.3 — Add readiness wiring & basic uptime monitoring
- **Priority:** Low
- **Why:** `/health` exists (uptime only). For production, add a readiness check that reflects DB connectivity and wire an external uptime monitor + error alerting.
- **Files:** `server/src/app.js`
- **Effort:** S · **Risk:** Low · **Dependencies:** none · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

### Task 8.4 — CI/CD pipeline
- **Priority:** Low
- **Why:** No CI. A pipeline running lint + (eventually) tests + build on push prevents broken deploys.
- **Files:** new CI config
- **Effort:** M · **Risk:** Low · **Dependencies:** 8.1 · **Blocks deployment:** ❌ No · **Optional after launch:** Yes

---

## Deployment Blocker Summary

The following must be green before the first production release:

| Task | Title |
|------|-------|
| 0.1 | Wire client→API connection model |
| 0.2 | Serve SPA from Express (if same-origin) |
| 0.3 | `trust proxy` + cookie attributes for HTTPS/proxy |
| 0.4 | Validate Helmet CSP against SPA + admin panel |
| 0.5 | Production secrets + rotation + `ALLOWED_ORIGINS` + `NODE_ENV` |
| 0.6 | Verify Atlas SRV resolution on prod host |
| 1.1 | Razorpay webhook secret configured |
| 1.2 | Razorpay live keys |
| 3.1 | CORS locked to production origins |

Everything else is a fast-follow patch (1.3, Phase 2) or post-launch improvement (Phases 3–8).

---

## Recommended Execution Order

1. **Phase 0** end-to-end (the architecture decision unblocks everything else).
2. **Phase 1** (payments must be real and reliable on day one — 1.1/1.2 block, 1.3 in the first patch).
3. **Phase 2** functional bugs, then **Phase 3** remaining security hardening.
4. **Phases 4–6** as data volume / multi-instance needs arrive.
5. **Phases 7–8** continuously, with 7.1 (remove stale audit docs) done immediately so this file stands alone.
