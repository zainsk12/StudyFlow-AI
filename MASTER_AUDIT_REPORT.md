> ⚠️ **OBSOLETE — superseded 2026-07-30.** This audit predates the current codebase. Do not use for current status. See `DEPLOYMENT_ROADMAP.md` and `PROJECT_VERIFICATION_JULY_2026.md` for current, verified status.

---

# Master Audit Report — StudyFlow AI

> Full-codebase audit, 2026-06-24. Consolidates: `PROJECT_OVERVIEW.md`, `CODE_QUALITY_AUDIT.md`, `BUG_REPORT.md`, `SECURITY_AUDIT.md`, `PRODUCTION_READINESS.md`, `PRODUCT_REVIEW.md`.
> Assumption: production launch to thousands of students. No code was modified.

---

## 0. One-paragraph verdict

StudyFlow AI is a well-built **study planner** wrapped in an **incomplete, partly-broken SaaS shell**. The free planning experience (difficulty-aware scheduling, progress, stats, Pomodoro, PDF export, feasibility coaching) is genuinely good. But it is **not deployable today**: real production secrets are committed in `server/.env`, the payment webhook is non-functional, there is no responsive design (fatal for a mobile student audience), the flagship AI coach doesn't receive the data it needs, there are no tests, no error tracking, and several state/auth paths are fragile. Substantial dead code (the entire `/api/subjects` and `/api/schedule/generate` surface) signals an unfinished architecture.

---

## 1. Critical Issues (MUST fix before deployment)

| # | Issue | Ref |
|---|---|---|
| C1 | **Live secrets committed in `server/.env`** (MongoDB creds, Groq, Mistral, Gmail app password, Razorpay key secret, JWT secret, admin secret). Rotate ALL; remove env files; use a secrets manager. | SECURITY §1 |
| C2 | **Weak JWT secret & admin secret** (low-entropy, guessable patterns — values redacted) — forgeable sessions / guessable full-admin access. | SECURITY §1 |
| C3 | **Razorpay webhook non-functional** (placeholder `RAZORPAY_WEBHOOK_SECRET`) → paid users can fail to get Pro. Webhook also returns 200 on error, so Razorpay never retries. | BUG-1, BUG-2 |
| C4 | **No responsive design (0 `@media`)** → app overflows/breaks on phones; header packs metrics+timer+avatar in one non-wrapping row. Blocker for a student product. | BUG-19, PROD §11 |
| C5 | **Prod misconfig shipped**: `NODE_ENV=development` → permissive CORS (`origin:'null'`, `localhost:*`) + stack traces leaked to clients. | PROD §1, SEC §6/§8 |
| C6 | **Paid AI feature reachable for free**: `/api/ai/regen-advice` lacks `requirePro`. | BUG-7, SEC §3 |
| C7 | **Password reset not bound to requester** — verified-flag-only reset enables takeover within the OTP window. | BUG-8, SEC §2 |

## 2. High Priority Issues

| # | Issue | Ref |
|---|---|---|
| H1 | **Light theme broken** across most screens (hard-coded dark hex ignore CSS vars). | BUG-20 |
| H2 | **AI coach lacks real context** — client strips topic names before sending; undercuts the core paid value prop. | BUG-18, PRODUCT §6 |
| H3 | **In-memory rate limiting & user cache** break under horizontal scaling and reset on deploy. | SEC §7, PROD §6 |
| H4 | **No error tracking, no tests, broken lint** (`ESLint 9` w/ no flat config), no CI. | PROD §4/§7, QUALITY §J |
| H5 | **Fragile dual-source state sync** (localStorage↔server `savedAt`) — multi-device data loss/resurrection; StrictMode disabled to mask it. | BUG-12, QUALITY §G |
| H6 | **Account enumeration on signup**; no captcha/MFA anywhere. | BUG-9, SEC §2 |
| H7 | **Cancellation/refund is manual admin-approval** and won't scale; a second unused instant-cancel endpoint can disagree. | BUG-3, PRODUCT §8 |
| H8 | **DB reliability**: `process.exit(1)` on connect blip, no retry; `Payment` collection unindexed on hot query fields. | PROD §5 |
| H9 | **`mongoSanitize` does not cover payment routes** (mounted before it). | BUG-25, SEC §4 |

## 3. Medium Priority Issues

- M1 Coupon `usedCount` race → can exceed `maxUses` (admin "recalculate" tool exists as evidence). (BUG-4)
- M2 Inconsistent API error envelope (`{error}` vs `{message}`) and inconsistent `dailyHours` bounds across layers. (QUALITY §H/§I)
- M3 `broadcastEmail` sends up to 500 emails inside one HTTP request (no queue). (QUALITY §F)
- M4 `AuthContext` polls `/api/auth/me` every 15s per tab indefinitely. (QUALITY §F)
- M5 Exam date not constrained to the future; degenerate single-day plans. (BUG-14)
- M6 Imported syllabi can exceed server caps and 400 *after* paying the AI cost. (BUG-16)
- M7 `deleteUser` doesn't cascade `CancellationRequest` → orphans + null populate. (BUG-27)
- M8 Accessibility: clickable divs, icon-only buttons without labels, global numeric shortcuts. (PROD §10, BUG-21)
- M9 No CSP/SRI for third-party scripts (Razorpay, fonts); `helmet` defaults only. (SEC §10)
- M10 Chat history & streak not persisted/synced across devices. (PRODUCT §5)

## 4. Low Priority Issues

- L1 "Resend code" doesn't resend (navigates back). (BUG-22)
- L2 Notifications/Preferences settings are localStorage-only no-ops. (BUG-23)
- L3 Duplicated `apiFetch`, date helpers, difficulty maps, `Card`, email templates. (QUALITY §B)
- L4 Unused deps `morgan`, `p-limit`; vestigial `_token` param, dead `Bearer` path. (QUALITY §A4/§A5, BUG-11)
- L5 Inline `@keyframes spin` duplicated despite `global.css`. (BUG-R)
- L6 `paymentId` shown in UI; minor info exposure. (SEC §8)

## 5. Security Risks (summary)

1. 🔴 Committed real secrets (C1) — assume compromise, rotate everything.
2. 🔴 Weak JWT/admin secrets (C2); single shared static admin secret with no per-admin identity/audit.
3. 🟠 Reset-flow takeover window (C7); account enumeration (H6); no MFA/captcha.
4. 🟠 Entitlement bypass on `regen-advice` (C6).
5. 🟠 In-memory limits weaken brute-force protection at scale; no dedicated admin brute-force limiter.
6. 🟡 mongoSanitize gap on payment routes; unescaped admin `$regex` (ReDoS); dev-mode CORS/stack-trace leakage if `NODE_ENV` wrong; no CSP.
7. 🟢 Genuine strengths: HttpOnly+SameSite=strict cookies, bcrypt, server-authoritative pricing, HMAC verification, helmet, layered limiters, redacted logs.

## 6. Technical Debt

- **Dead architecture**: entire `/api/subjects` stack + `/api/schedule/generate` + server `scheduler.js` are unused (~500+ lines); duplicated validation layers. (QUALITY §A)
- **100% inline styles** — no reuse, breaks theming, bloats bundle. (QUALITY §D)
- **God modules**: `useStudyPlanner` (429 lines), `SettingsPanel` (751), `ProgressTab` (625), `admin.controller` (605, mixed concerns + mid-file imports), `admin-panel.html` (1,670, no build). (QUALITY §E)
- **Dual subject persistence** (`Subject` collection vs `StudyPlan.subjects` Mixed). (QUALITY §G)
- **Patched-over sync bugs** (StrictMode removed, keepalive flush, hydration gate). (QUALITY §D/§G)
- No shared client/server constants module in the monorepo.

## 7. Missing Features

Must-have for launch: responsive UI; working payment confirmation; truthful context-aware AI; self-serve subscription management; `NODE_ENV`/secrets hygiene.
Growth/retention: real reminders + calendar (.ics) export; persisted chat + cross-device sync of streak/settings; spaced-repetition / adaptive replanning; onboarding tour + sample plan; marketing/landing page + SEO; auto-login after signup.
(See PRODUCT_REVIEW §9.)

## 8. Recommended Architecture Improvements

1. **Secrets/config**: `.env.example` + secrets manager; enforce `NODE_ENV=production`; explicit CORS allowlist; add CSP.
2. **State model**: make the **server authoritative** with optimistic UI; drop the localStorage↔server `savedAt` reconciliation; restore `StrictMode`. Persist chat + streak + settings server-side.
3. **Externalise shared state**: Redis for rate limiting and the user/Pro cache → enables horizontal scaling.
4. **Data layer**: index `Payment.{razorpayOrderId,userId}`; wrap payment grant in a transaction; make coupon increment atomic; add DB connect retry/backoff; readiness probe that checks Mongo.
5. **Collapse dead surface**: delete unused subjects/generate APIs and the duplicate cancel flow; pick one cancellation path (self-serve).
6. **Shared package** for constants/difficulty maps/scheduler so client and server can't drift.
7. **Styling**: migrate to CSS modules / a token system that honours the theme; fix light mode; add responsive breakpoints.
8. **Background jobs**: queue for broadcast emails and reminder delivery.
9. **Observability**: Sentry (client+server), structured log shipping, request/payment/AI-spend metrics.
10. **Quality gates**: fix ESLint flat config; add tests (auth, payment verify/webhook, scheduler, requirePro) and CI; `npm audit` + Dependabot.
11. **Admin**: real admin accounts with roles + audit logging instead of one shared secret.

## 9. Estimated Deployment Readiness Score

### **26 / 100**

| Dimension (weight) | Score |
|---|---|
| Security (25) | 5/25 — committed live secrets, weak secrets, reset flaw |
| Core functionality (15) | 11/15 — planner is solid; AI context & sync flawed |
| Payments/monetization (15) | 5/15 — webhook broken, manual cancel, entitlement bypass |
| Reliability/scalability (15) | 4/15 — in-memory state, no retry, no tests |
| Mobile/responsive/UX (10) | 1/10 — no responsive design, broken light theme |
| Observability/ops (10) | 1/10 — no error tracking/metrics/CI/backup docs |
| Code quality/maintainability (10) | 5/10 — readable but heavy debt & dead code |
| **Total** | **~26/100** |

Interpretation: **functional prototype / advanced MVP**, not a launch-ready SaaS. The planner could ship behind a "free beta" once C1–C5 are fixed; charging money requires C3, H2, H7 and the payment hardening as well.

## 10. Recommended Action Plan

**Phase 0 — Stop-the-bleed (hours–days)**
1. Rotate every secret in `server/.env`; remove env files from the tree; add `.env.example`. (C1, C2)
2. Set `NODE_ENV=production` and lock CORS for prod. (C5)
3. Add `requirePro` to `/api/ai/regen-advice`. (C6)
4. Configure `RAZORPAY_WEBHOOK_SECRET`; make the webhook return 5xx on error. (C3)
5. Bind password reset to the OTP/one-time token. (C7)

**Phase 1 — Launch blockers (1–3 weeks)**
6. Implement responsive layout + fix light theme. (C4, H1)
7. Fix AI coach context (send topic names); persist chat. (H2)
8. Externalise rate limiting + user cache to Redis. (H3)
9. Index `Payment`; add DB retry + readiness probe; transactional payment grant. (H8)
10. Restore `StrictMode`; move to server-authoritative state. (H5)
11. Self-serve subscription management; consolidate cancel flow. (H7)
12. Add Sentry + basic metrics; fix ESLint; add a first test suite (auth/payment/scheduler) + CI. (H4)

**Phase 2 — Quality & growth (3–8 weeks)**
13. Delete dead APIs (subjects/generate, duplicate cancel); shared constants package; split god modules; migrate inline styles. (Tech debt §6)
14. Real reminders + calendar export; cross-device streak/settings sync.
15. Onboarding tour + sample plan; auto-login on signup.
16. Marketing/landing page + SEO; accessibility pass.
17. Revisit pricing strategy (lifetime-only ₹199 is low ARPU); admin accounts + audit logging.
18. `npm audit`/Dependabot; backup/restore runbook + data-retention policy.

---

### Index of detailed reports
- `PROJECT_OVERVIEW.md` — what the system is and how it actually works.
- `CODE_QUALITY_AUDIT.md` — dead code, duplication, anti-patterns, structure, perf, error handling.
- `BUG_REPORT.md` — 28 bugs across payments, auth, sync, AI, UI, DB, build.
- `SECURITY_AUDIT.md` — secrets, authn/authz, injection, XSS/CSRF, rate limiting, uploads, deps.
- `PRODUCTION_READINESS.md` — env, logging, monitoring, DB, scaling, deploy, backup, SEO, a11y, mobile.
- `PRODUCT_REVIEW.md` — onboarding, completeness, UX, AI/planner workflows, subscription, missing features.
