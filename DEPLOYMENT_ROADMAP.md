# Deployment Roadmap — StudyFlow AI

> Derived from `MASTER_AUDIT_REPORT.md` (audit 2026-06-24). Groups every finding into 7 phases.
> **No code has been modified.** This is a sequencing plan only.
>
> Effort scale: **S** ≤ ½ day · **M** ½–2 days · **L** 3–5 days · **XL** > 1 week.
> Risk = chance a change breaks existing behaviour if done carelessly.

---

## How to read this roadmap (safe-ordering principle)

Tasks are ordered so each one is **non-breaking given the ones before it**:

1. **Phase 1 (Security)** leads with secret rotation and config — these are mostly *operational* (no app-logic change) and must happen before anything touches the repo or ships. Code-level security fixes here are **additive guards** (adding `requirePro`, binding reset to OTP) that don't alter the happy path.
2. **Phase 2 (Mobile/UI)** is pure presentation — isolated from backend, safe after security.
3. **Phase 3 (Payments)** fixes revenue-critical flows; done before AI so money works first.
4. **Phase 4 (AI)** improves the paid feature payload (additive context).
5. **Phase 5 (Dead-code removal)** comes *after* 1–4 so we never delete something a fix still depended on; each deletion is verified-unused first.
6. **Phase 6 (Production hardening)** adds observability, tests, scaling, reliability — built on a now-stable codebase.
7. **Phase 7 (Deployment)** is last: it depends on everything above being in place.

> ⚠️ Recommended global pre-req: **convert this folder into a git repository with a feature-branch workflow** before changing code, so each task is reversible. (`Is a git repository: false` today.)

---

# PHASE 1 — Security Fixes

Goal: eliminate the existential risks. Most tasks are operational or additive — they do not change the success path of existing features.

### 1.1 Rotate ALL leaked secrets *(operational, do first)*
- **Priority:** 🔴 Critical (C1)
- **Files affected:** `server/.env` (and the external services themselves: MongoDB Atlas, Groq, Mistral, Gmail, Razorpay)
- **Estimated effort:** M
- **Risk level:** Medium — rotating the Mongo password/JWT secret will **invalidate live sessions and break the running app until the new values are deployed**; coordinate with a maintenance window.
- **Dependencies:** none (do before any commit/deploy)
- **Deployment impact:** Requires redeploy with new env values; existing JWT cookies become invalid (users must re-login). Must precede 1.2.

### 1.2 Remove env files from the repo; add `.env.example`; adopt a secrets manager
- **Priority:** 🔴 Critical (C1)
- **Files affected:** `server/.env`, `client/.env`, new `server/.env.example`, `client/.env.example`, `.gitignore` (already lists `.env`)
- **Estimated effort:** S
- **Risk level:** Low — config plumbing only.
- **Dependencies:** 1.1 (rotate before exposing example placeholders)
- **Deployment impact:** Secrets move to platform/secret-store env vars; deploy config must be updated.

### 1.3 Generate high-entropy JWT secret & admin secret
- **Priority:** 🔴 Critical (C2)
- **Files affected:** `server/.env` (`JWT_SECRET`, `ADMIN_SECRET`); consumers `server/src/controllers/auth.controller.js`, `server/src/middleware/auth.middleware.js`, `server/src/middleware/admin.middleware.js`, `server/src/app.js`
- **Estimated effort:** S
- **Risk level:** Medium — new `JWT_SECRET` invalidates all sessions (re-login); admin panel users must re-enter the new secret.
- **Dependencies:** 1.1 (part of the same rotation event)
- **Deployment impact:** Re-login for all users; update admin panel credentials.

### 1.4 Set `NODE_ENV=production` and lock CORS for prod
- **Priority:** 🔴 Critical (C5)
- **Files affected:** `server/.env`, `server/src/app.js` (`getAllowedOrigins`, `origin:'null'`/`localhost` dev branches), `server/src/middleware/errorHandler.js` (stack-trace gating already keyed off `isDev`)
- **Estimated effort:** S
- **Risk level:** Medium — if `ALLOWED_ORIGINS`/`CLIENT_URL` aren't set correctly, prod CORS will block the real frontend. Test the exact production origin first.
- **Dependencies:** none
- **Deployment impact:** Stops stack-trace leakage and dev CORS leniency; the production client origin **must** be configured or the app breaks.

### 1.5 Add `requirePro` to `/api/ai/regen-advice`
- **Priority:** 🔴 Critical (C6)
- **Files affected:** `server/src/routes/ai.routes.js`
- **Estimated effort:** S
- **Risk level:** Low — additive guard; UI already gates this for free users (`SmartRegenBanner.jsx`), so legitimate (Pro) flow is unchanged.
- **Dependencies:** none
- **Deployment impact:** Closes a paid-feature/cost-leak bypass; no impact on Pro users.

### 1.6 Bind password reset to the OTP / one-time token
- **Priority:** 🔴 Critical (C7)
- **Files affected:** `server/src/controllers/auth.controller.js` (`verifyOtp`, `resetPassword`), `server/src/routes/auth.routes.js`, `client/src/pages/LoginPage.jsx` (carry OTP/token into the reset call)
- **Estimated effort:** M
- **Risk level:** Medium — touches the live reset flow; must keep the 3-step UX working. Test the full forgot→OTP→reset path.
- **Dependencies:** none
- **Deployment impact:** Closes account-takeover window; requires synchronized client+server deploy.

### 1.7 Fix signup account enumeration; plan captcha
- **Priority:** 🟠 High (H6)
- **Files affected:** `server/src/controllers/auth.controller.js` (`signup`), `client/src/pages/SignupPage.jsx` (messaging); optional new captcha integration
- **Estimated effort:** M
- **Risk level:** Low–Medium — changing the duplicate-email response affects UX copy; keep it clear without revealing existence.
- **Dependencies:** none
- **Deployment impact:** Minor UX wording change; captcha (if added) needs a provider key.

### 1.8 Extend `mongoSanitize` to payment routes
- **Priority:** 🟠 High (H9)
- **Files affected:** `server/src/app.js` (middleware ordering around `/api/payment`), `server/src/routes/payment.routes.js`
- **Estimated effort:** S
- **Risk level:** Medium — the payment router is mounted **before** `express.json()` to preserve the raw webhook body; reorder carefully so the webhook still receives a raw `Buffer` while JSON routes get sanitized. Test webhook signature verification after.
- **Dependencies:** coordinate with 3.1 (same router/ordering area) to avoid two conflicting edits
- **Deployment impact:** Hardening only; verify both webhook and JSON payment routes still work.

### 1.9 Add Content-Security-Policy / SRI; escape admin `$regex` search
- **Priority:** 🟡 Medium (M9, SEC §4)
- **Files affected:** `server/src/app.js` (helmet CSP config), `client/index.html` (Razorpay/fonts origins, SRI), `server/src/controllers/admin.controller.js` (`getUsers` regex escaping)
- **Estimated effort:** M
- **Risk level:** Medium — an over-tight CSP can block Razorpay checkout, Google Fonts, or inline styles/`<style>` blocks the app injects; roll out in report-only mode first.
- **Dependencies:** 1.4 (prod config)
- **Deployment impact:** Stronger headers; must validate Razorpay popup + fonts still load.

### 1.10 Reduce sensitive data exposure (paymentId in UI) + plan admin accounts/audit
- **Priority:** 🟡 Medium / 🟠 High (L6, SEC §3)
- **Files affected:** `client/src/components/Header/SettingsPanel.jsx` (hide/trim `paymentId`); design doc for replacing the single shared admin secret with per-admin accounts + audit log (future: `admin.middleware.js`, new auth + `audit` model)
- **Estimated effort:** S (UI) / XL (admin accounts — defer to Phase 6 if needed)
- **Risk level:** Low (UI) / High (admin auth rework)
- **Dependencies:** none for UI; admin rework depends on having a real admin model
- **Deployment impact:** UI tweak now; admin-account overhaul is a larger follow-up.

---

# PHASE 2 — Mobile Responsiveness & UI Correctness

Goal: make the app usable on phones and fix the broken theme. Pure presentation — isolated from backend, safe after Phase 1.

### 2.1 Introduce responsive breakpoints (global)
- **Priority:** 🔴 Critical (C4 / BUG-19)
- **Files affected:** `client/src/styles/global.css` (add `@media`), `client/src/components/Header/Header.jsx` (metrics+Pomodoro+avatar row), `client/src/App.jsx` (`maxWidth:960` container)
- **Estimated effort:** L
- **Risk level:** Medium — large visual surface; risk of regressions on desktop. Snapshot/visual-test desktop before/after.
- **Dependencies:** ideally after 2.3 (theming refactor) if you migrate styles together; otherwise standalone
- **Deployment impact:** Frontend-only; no API change. Major UX uplift for the mobile-majority audience.

### 2.2 Reflow fixed grids/modals for small screens
- **Priority:** 🔴 Critical (C4)
- **Files affected:** `client/src/components/Stats/StatsTab.jsx` (`repeat(4,1fr)`), `client/src/components/Header/ProfileModal.jsx`, `PaywallModal.jsx`, `Setup/*`, `Schedule/*`, `Progress/ProgressTab.jsx`
- **Estimated effort:** L
- **Risk level:** Medium — many inline-styled grids to adjust.
- **Dependencies:** 2.1
- **Deployment impact:** Frontend-only.

### 2.3 Fix broken light theme (use CSS vars instead of hard-coded hex)
- **Priority:** 🟠 High (H1 / BUG-20)
- **Files affected:** nearly all `client/src/components/**` and `pages/**` using literal `#0d1117/#1c2030/#f1f5f9…`; `client/src/context/ThemeContext.jsx` (already provides vars)
- **Estimated effort:** L
- **Risk level:** Medium — sweeping find/replace of colors; risk of missed spots. Do per-component with visual checks in both themes.
- **Dependencies:** best combined with 2.1/2.2 (same files)
- **Deployment impact:** Frontend-only; makes the existing theme toggle actually work.

### 2.4 Accessibility pass (clickable divs, aria-labels, focus, keyboard shortcuts)
- **Priority:** 🟡 Medium (M8 / BUG-21)
- **Files affected:** `client/src/components/Progress/ProgressTab.jsx`, `Schedule/*`, icon buttons across components, `client/src/App.jsx` (numeric shortcut handler)
- **Estimated effort:** M
- **Risk level:** Low–Medium — converting divs to buttons may shift layout slightly.
- **Dependencies:** after 2.1–2.3 (touch the same components once)
- **Deployment impact:** Frontend-only; better a11y, fewer shortcut conflicts.

---

# PHASE 3 — Payment & Subscription Fixes

Goal: make money flow reliably and cancellations sane. Revenue-critical; do before AI polish.

### 3.1 Configure Razorpay webhook secret + make webhook retry-safe
- **Priority:** 🔴 Critical (C3 / BUG-1, BUG-2)
- **Files affected:** `server/.env` (`RAZORPAY_WEBHOOK_SECRET`), `server/src/controllers/payment.controller.js` (`handleWebhook` — return 5xx on processing error so Razorpay retries), `server/src/app.js` (startup warning)
- **Estimated effort:** M
- **Risk level:** Medium — must keep raw-body HMAC verification intact; test with Razorpay's webhook test events. Coordinate with 1.8 (same router/ordering).
- **Dependencies:** 1.1 (real webhook secret from Razorpay), 1.8 (middleware ordering)
- **Deployment impact:** Restores automatic Pro-granting; requires the webhook URL to be registered in the Razorpay dashboard and reachable over HTTPS.

### 3.2 Make coupon `usedCount` increment atomic
- **Priority:** 🟡 Medium (M1 / BUG-4)
- **Files affected:** `server/src/controllers/payment.controller.js` (`incrementUniqueUse`), `server/src/models/Coupon.js`
- **Estimated effort:** M
- **Risk level:** Medium — concurrency logic; test that limited coupons can't exceed `maxUses` under parallel redemptions.
- **Dependencies:** 3.1 (webhook also calls this path)
- **Deployment impact:** Prevents coupon over-redemption / revenue leakage.

### 3.3 Validate imported syllabus size before charging the AI cost
- **Priority:** 🟡 Medium (M6 / BUG-16)
- **Files affected:** `server/src/controllers/syllabus.controller.js`, `client/src/components/Setup/SyllabusImport.jsx`, alignment with `server/src/controllers/schedule.controller.js` caps (50 subjects/200 topics)
- **Estimated effort:** M
- **Risk level:** Low — additive validation + clearer messaging.
- **Dependencies:** none (but logically grouped with paid flows)
- **Deployment impact:** Better UX; avoids "paid the AI call then 400 on save".

### 3.4 Consolidate cancellation flows / self-serve plan
- **Priority:** 🟠 High (H7 / BUG-3)
- **Files affected:** `server/src/controllers/payment.controller.js` (`cancelSubscription`), `server/src/routes/payment.routes.js`, `server/src/controllers/cancellation.controller.js`, `client/src/components/Header/SettingsPanel.jsx`
- **Estimated effort:** L
- **Risk level:** Medium — decide on ONE flow (admin-approval vs instant self-serve) and remove the other; ensure no UI path calls the removed endpoint. (The instant `cancelSubscription` endpoint is currently unused — removal overlaps Phase 5.)
- **Dependencies:** confirm-unused check (Phase 5 methodology); do the policy decision here, the deletion in 5.x
- **Deployment impact:** Clearer, scalable cancellation; possible product/policy change (refund handling).

### 3.5 Add indexes on `Payment` hot fields
- **Priority:** 🟠 High (H8, partial)
- **Files affected:** `server/src/models/Payment.js` (`razorpayOrderId`, `userId` indexes)
- **Estimated effort:** S
- **Risk level:** Low — additive index; build on a maintenance window if the collection is large.
- **Dependencies:** none
- **Deployment impact:** Faster verify/webhook/admin queries as payment volume grows.

---

# PHASE 4 — AI Coach Improvements

Goal: make the paid AI actually deliver its promise. Additive payload/persistence changes.

### 4.1 Send real topic context to the AI coach
- **Priority:** 🟠 High (H2 / BUG-18)
- **Files affected:** `client/src/components/AICoach/AICoachTab.jsx` (include topic names/difficulty), `server/src/controllers/ai.controller.js` (`summarizeSubjects`/system prompt; mind token limits)
- **Estimated effort:** M
- **Risk level:** Low–Medium — larger prompts cost more tokens; cap/trim to stay within limits. No breaking change to the request contract if done carefully.
- **Dependencies:** none
- **Deployment impact:** Materially better coaching; slightly higher per-message AI cost — monitor spend.

### 4.2 Persist chat history server-side
- **Priority:** 🟡 Medium (M10, partial)
- **Files affected:** new model/route (e.g. `ChatMessage`/extend `StudyPlan`), `server/src/controllers/ai.controller.js`, `client/src/App.jsx` (chat state), `client/src/components/AICoach/AICoachTab.jsx`
- **Estimated effort:** L
- **Risk level:** Low–Medium — additive feature; ensure it doesn't bloat the `/schedule/full` payload (use a separate store).
- **Dependencies:** 4.1
- **Deployment impact:** Chat survives refresh/devices; new persistence surface to back up.

### 4.3 Truthful AI branding + "Smart Regenerate" depth
- **Priority:** 🟡 Medium (PRODUCT §6)
- **Files affected:** `README.md`, `client/src/components/AICoach/AICoachTab.jsx` copy ("Groq" vs "Claude"), `server/src/controllers/ai.controller.js` (`regenAdvice`)
- **Estimated effort:** S–M
- **Risk level:** Low
- **Dependencies:** none
- **Deployment impact:** Honest messaging; optional smarter regen logic.

---

# PHASE 5 — Dead Code Removal

Goal: shrink the surface **after** all fixes land, so nothing live still depends on what we delete. Methodology for each: grep client+server for usage → confirm zero references → remove → run app + tests.

### 5.1 Remove unused subjects API + (decide on) Subject model
- **Priority:** 🟡 Medium (Tech debt §6 / QUALITY A1)
- **Files affected:** `server/src/routes/subject.routes.js`, `server/src/controllers/subject.controller.js`, `server/src/app.js` (route mount), and `validate.js` rules for subjects/topics; `server/src/models/Subject.js` (only if confirmed unused elsewhere)
- **Estimated effort:** M
- **Risk level:** Medium — **must verify** the client never calls `/api/subjects` (audit confirms it doesn't) before deleting; keep the `Subject` model if any migration/analytics depends on it.
- **Dependencies:** Phases 1–4 complete (ensure no new fix started using these routes)
- **Deployment impact:** Smaller API surface; no user-facing change.

### 5.2 Remove unused `/api/schedule/generate` + server `scheduler.js`
- **Priority:** 🟡 Medium (QUALITY A2)
- **Files affected:** `server/src/routes/schedule.routes.js` (`/generate`), `server/src/controllers/schedule.controller.js` (`generate`, possibly `getSchedule`), `server/src/utils/scheduler.js`
- **Estimated effort:** S–M
- **Risk level:** Medium — confirm client builds schedules locally (it does, `useStudyPlanner`/`utils/scheduler.js`) and uses only `/schedule/full`.
- **Dependencies:** 5.1 methodology
- **Deployment impact:** None user-facing.

### 5.3 Remove duplicate cancel endpoint + dead auth `sendCancelOtp`
- **Priority:** 🟡 Medium (QUALITY A3)
- **Files affected:** `server/src/controllers/auth.controller.js` (`sendCancelOtp`), `server/src/routes/auth.routes.js` (`/send-cancel-otp`), unused `payment.controller.cancelSubscription` + `payment.routes.js:/cancel`
- **Estimated effort:** S
- **Risk level:** Medium — only after 3.4 decides the canonical cancellation flow.
- **Dependencies:** 3.4
- **Deployment impact:** None user-facing.

### 5.4 Remove unused deps and vestigial code
- **Priority:** 🟡 Low (L4)
- **Files affected:** `server/package.json` (`morgan`, `p-limit`), `client/src/hooks/useStudyPlanner.js` (`_token`), `server/src/middleware/auth.middleware.js` (dead `Bearer` path — keep only if a non-cookie client is planned)
- **Estimated effort:** S
- **Risk level:** Low — confirm no import before removing.
- **Dependencies:** none
- **Deployment impact:** Smaller install; cleaner code.

### 5.5 De-duplicate shared helpers/constants
- **Priority:** 🟡 Low (L3, L5)
- **Files affected:** create shared difficulty/constants module; `client/src/utils/scheduler.js`, `constants/index.js`, `SyllabusImport.jsx`; consolidate `apiFetch` (`LoginPage`/`SignupPage`), date helpers, the duplicate `Card`, inline `@keyframes spin`
- **Estimated effort:** M
- **Risk level:** Low–Medium — refactor; rely on tests (Phase 6) to catch regressions.
- **Dependencies:** ideally after Phase 6.1 (tests) for safety
- **Deployment impact:** None user-facing.

### 5.6 Split god modules (optional, maintainability)
- **Priority:** 🟡 Low (QUALITY E)
- **Files affected:** `client/src/components/Header/SettingsPanel.jsx` (751), `Progress/ProgressTab.jsx` (625), `server/src/controllers/admin.controller.js` (605, fix mid-file imports), `server/admin-panel.html` (1,670)
- **Estimated effort:** L
- **Risk level:** Medium — large refactors; do behind tests.
- **Dependencies:** Phase 6.1 (tests)
- **Deployment impact:** None user-facing.

---

# PHASE 6 — Production Readiness

Goal: observability, reliability, scaling, quality gates — on a now-stable, slimmer codebase.

### 6.1 Fix ESLint flat config + add tests + CI
- **Priority:** 🟠 High (H4)
- **Files affected:** new `client/eslint.config.js`, `client/package.json` (lint script already exists), new test setup (Vitest/Jest) + tests for auth/payment verify+webhook/scheduler/`requirePro`; new `.github/workflows/ci.yml`
- **Estimated effort:** L
- **Risk level:** Low — additive tooling; doesn't change runtime.
- **Dependencies:** ideally before 5.5/5.6 refactors so they're protected
- **Deployment impact:** Quality gate before deploys; no runtime change.

### 6.2 Add error tracking (Sentry) + structured log shipping + metrics
- **Priority:** 🟠 High (H4 / PROD §3,§4)
- **Files affected:** `client/src/components/common/ErrorBoundary.jsx`, `server/src/app.js`, `server/src/middleware/errorHandler.js`, `requestLogger.js`
- **Estimated effort:** M
- **Risk level:** Low — additive.
- **Dependencies:** 1.4 (env), provider keys via secret store (1.2)
- **Deployment impact:** Visibility into prod errors / payment success / AI spend.

### 6.3 Externalise rate limiting & user cache to Redis
- **Priority:** 🟠 High (H3)
- **Files affected:** `server/src/middleware/rateLimiter.js`, `server/src/middleware/auth.middleware.js` (`USER_CACHE`, cache sweep), new Redis client/config
- **Estimated effort:** M–L
- **Risk level:** Medium — introduces a new infra dependency; ensure graceful degradation if Redis is down. Required for horizontal scaling.
- **Dependencies:** infra provisioning (Phase 7 overlaps)
- **Deployment impact:** Enables multi-instance scaling; adds a Redis service to the deployment.

### 6.4 Make state model server-authoritative; restore StrictMode
- **Priority:** 🟠 High (H5 / BUG-12)
- **Files affected:** `client/src/hooks/useStudyPlanner.js` (drop `savedAt` localStorage reconciliation, optimistic UI), `client/src/main.jsx` (re-enable `React.StrictMode`), `server/src/controllers/schedule.controller.js`
- **Estimated effort:** L
- **Risk level:** **High** — this is the most behaviour-changing item; the current sync is fragile but works. Needs careful testing (multi-tab, multi-device, offline, refresh) and is best done behind tests (6.1).
- **Dependencies:** 6.1 (tests)
- **Deployment impact:** More reliable cross-device data; risk of regressions if rushed — stage carefully.

### 6.5 DB reliability: connect retry/backoff + readiness probe
- **Priority:** 🟠 High (H8)
- **Files affected:** `server/config/db.js` (retry instead of `process.exit(1)`), `server/src/app.js` (`/health` → readiness that checks Mongo)
- **Estimated effort:** M
- **Risk level:** Low–Medium — ensure the process still fails fast if Mongo is truly unavailable (don't hang forever).
- **Dependencies:** none
- **Deployment impact:** Survives transient Atlas blips; orchestrators get a real readiness signal.

### 6.6 Background queue for broadcast/reminder emails
- **Priority:** 🟡 Medium (M3)
- **Files affected:** `server/src/controllers/admin.controller.js` (`broadcastEmail`), new job/queue (e.g. BullMQ on the Phase 6.3 Redis), `server/src/utils/email.js`
- **Estimated effort:** L
- **Risk level:** Medium — moves work out of the request; test delivery + rate limits.
- **Dependencies:** 6.3 (Redis)
- **Deployment impact:** Non-blocking broadcasts; new worker process.

### 6.7 Consistency & correctness cleanups
- **Priority:** 🟡 Medium (M2, M5, M7, M4)
- **Files affected:** unify error envelope across controllers (`subject`/`auth`/etc.) and `dailyHours` bounds (`validate.js`, `schedule.controller.js`, `StudyPlan.js`); exam-date `min` in `SetupTab.jsx`; `deleteUser` cascade `CancellationRequest` (`admin.controller.js`); reduce `AuthContext` poll frequency/backoff (`AuthContext.jsx`)
- **Estimated effort:** M
- **Risk level:** Low–Medium — broad but small edits; tests (6.1) help.
- **Dependencies:** 6.1
- **Deployment impact:** Cleaner API, fewer edge-case bugs, less idle load.

### 6.8 Finish or remove fake features; minor UX fixes
- **Priority:** 🟡 Low (L1, L2, M10 streak sync)
- **Files affected:** `client/src/components/Header/SettingsPanel.jsx` (Notifications/Preferences are localStorage no-ops — wire to backend or remove), `client/src/pages/LoginPage.jsx` (real "Resend code"), streak sync (`useStudyPlanner.js`)
- **Estimated effort:** M
- **Risk level:** Low
- **Dependencies:** 6.6 if reminders become real (needs the queue)
- **Deployment impact:** Removes false promises; reminders (if built) add real retention value.

### 6.9 Backup/DR runbook + data-retention policy + SEO surface
- **Priority:** 🟡 Medium (PROD §8,§9)
- **Files affected:** docs/runbook (Atlas backup verification, restore steps), data-retention/deletion policy doc, new marketing/landing page + meta/OG/robots/sitemap (currently `client/index.html` is a bare SPA shell)
- **Estimated effort:** L
- **Risk level:** Low
- **Dependencies:** none
- **Deployment impact:** Operational safety + a customer-acquisition surface.

---

# PHASE 7 — Deployment

Goal: ship safely. Everything here depends on Phases 1–6.

### 7.1 Production build & serving pipeline for the SPA
- **Priority:** 🔴 Critical (PROD §1,§7)
- **Files affected:** `client/vite.config.js` (build), static hosting/CDN config, reverse-proxy config mapping `/api` → Express (the current `/api` proxy is **dev-only**), or an absolute API base
- **Estimated effort:** M
- **Risk level:** Medium — misrouting `/api` in prod breaks the whole app; test end-to-end against the built bundle.
- **Dependencies:** 1.4 (CORS/origins)
- **Deployment impact:** Defines how users actually reach the app.

### 7.2 Containerisation / process management
- **Priority:** 🟠 High (PROD §7)
- **Files affected:** new `Dockerfile`(s)/compose or platform config, `server/package.json` (add `engines`, confirm `start`), root scripts, process manager (PM2/systemd) or platform runtime
- **Estimated effort:** M
- **Risk level:** Low–Medium
- **Dependencies:** 6.3 (Redis), 6.5 (readiness probe), 7.1
- **Deployment impact:** Reproducible, restartable deployments; supports multi-instance (with 6.3).

### 7.3 Configure all prod env/secrets in the platform + register webhooks
- **Priority:** 🔴 Critical (C1, C3)
- **Files affected:** platform secret store (from 1.2), Razorpay dashboard webhook registration (HTTPS URL), Mongo Atlas network/IP allowlist
- **Estimated effort:** S–M
- **Risk level:** Medium — missing/typo'd env var = broken app or broken payments.
- **Dependencies:** 1.1–1.4, 3.1, 6.2/6.3 keys
- **Deployment impact:** The actual go-live configuration.

### 7.4 Pre-launch verification + staged rollout
- **Priority:** 🔴 Critical
- **Files affected:** none (process): smoke-test auth, schedule save/load, payment (test mode → live), webhook delivery, AI chat/import, mobile layout, light theme, health/readiness, error tracking, rate limits across instances
- **Estimated effort:** M
- **Risk level:** Low (it's the safety net)
- **Dependencies:** all prior tasks
- **Deployment impact:** Final gate; do a canary/staged rollout with the ability to roll back (git + container tags).

### 7.5 Add `npm audit` / Dependabot to CI; ongoing security cadence
- **Priority:** 🟡 Medium (SEC §10)
- **Files affected:** `.github/` (Dependabot config), CI from 6.1
- **Estimated effort:** S
- **Risk level:** Low
- **Dependencies:** 6.1
- **Deployment impact:** Continuous dependency-risk monitoring post-launch.

---

## Phase summary & gating

| Phase | Theme | Blocking for launch? | Hardest/riskiest task |
|---|---|---|---|
| 1 | Security fixes | **Yes** (C1–C2,C5–C7) | 1.6 reset binding, 1.9 CSP |
| 2 | Mobile & UI | **Yes** (C4) | 2.1/2.3 responsive + theme sweep |
| 3 | Payments | **Yes** (C3) | 3.1 webhook, 3.4 cancellation policy |
| 4 | AI coach | No (but needed to charge confidently) | 4.2 chat persistence |
| 5 | Dead-code removal | No | 5.1/5.2 verified deletions |
| 6 | Production readiness | Partly (6.1–6.5 strongly advised) | **6.4 state model rewrite** |
| 7 | Deployment | **Yes** | 7.1 SPA serving, 7.3 prod secrets |

**Minimum viable launch path:** Phase 1 (all) → Phase 2 (2.1–2.3) → Phase 3 (3.1, 3.5) → Phase 6 (6.1, 6.2, 6.5) → Phase 7. Phases 4, 5, and the remainder of 6 can follow post-launch without blocking, **except** do not advertise/charge for AI features until 4.1 lands.

> Reminder: this roadmap is planning only — **no code has been changed.**
