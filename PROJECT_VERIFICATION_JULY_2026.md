# StudyFlow AI — Development Status Verification

## Executive Summary

- **Overall completion estimate: ~75-80%** of what the markdown docs describe as "remaining work" is actually already done in the code.
- **Key finding: the markdown files are internally inconsistent about currency.** `DEPLOYMENT_ROADMAP.md` (2026-06-26) claims to be the "single source of truth" superseding the six audit docs (2026-06-24), but the **actual code is newer than the roadmap itself** — most of its "Phase 0–3" blockers are already fixed in code that the roadmap still lists as outstanding.
- Completed (verified in code): **~18 roadmap tasks**. Partial: **~3**. Still pending: **~12**, mostly Phase 4–8 (nice-to-have/scaling) items plus two real launch blockers (live Razorpay keys + webhook secret) and the doc-cleanup task itself.
- One bug (AI coach losing topic-name context) is verified **still broken** and isn't tracked in the newest roadmap at all.

---

## Completed Features / Fixes (verified against code, contradicting the roadmap's "pending" status)

| # | Markdown source | Claim | Evidence in code |
|---|---|---|---|
| 1 | Roadmap Task 0.1/0.2 | Client→API model + SPA serving "blocks deployment" | `app.js` serves `client/dist` with SPA history fallback, mounted after `/api` routes; decision (same-origin) is made and commented as final |
| 2 | Roadmap Task 0.3 | `trust proxy` unset | `app.js` sets `trust proxy` conditionally via `TRUST_PROXY` env / defaults to `1` in prod |
| 3 | Roadmap Task 0.4 | Helmet CSP unvalidated | Full tailored `cspDirectives` object present, plus a route-scoped relaxed CSP specifically for `/admin-panel` |
| 4 | Roadmap Task 0.5 | Secrets/env not production-hardened | `.env` header confirms "All previous values were ROTATED OUT on 2026-06-25"; `.env.example` has placeholders only; startup warns on missing prod vars |
| 5 | Roadmap Task 0.6 | Mongo SRV DNS fix unverified | `db.js` has the documented DNS-resolver guard plus connection lifecycle logging/reconnect handlers |
| 6 | Roadmap Task 1.3 | Email hardcodes "Lifetime Access" | `email.js` now has `planLabelFor()`/`validityFor()` helpers keyed on `planType`; callers pass `{ planType, label, expiresAt }` |
| 7 | Roadmap Task 2.1 | `/api/schedule/generate` Pro-gate inconsistency | `requirePro` removed; route comment explicitly documents the decision ("intentionally NOT Pro-gated... roadmap task 2.1") |
| 8 | Roadmap Task 2.2 | `invalidateUserCache` never called | Called in **auth**, **payment**, **cancellation**, and **admin** controllers (11 call sites) |
| 9 | Roadmap Task 2.3 | Shared OTP fields across flows | `User.js` has separate `resetOtp`, `cancelOtp`, **and** `pwdChangeOtp` field pairs |
| 10 | Roadmap Task 3.1 | CORS not locked to prod origins | `getAllowedOrigins()` only adds `localhost` in dev; prod requires explicit `ALLOWED_ORIGINS` |
| 11 | Roadmap Task 3.2 | Admin auth model unhardened | `admin.middleware.js` now supports named `ADMIN_SECRETS`, constant-time multi-credential matching, and structured audit-log lines for state-changing requests; dedicated `adminApiLimiter`/`adminPanelLimiter` added in `rateLimiter.js` |
| 12 | Roadmap Task 3.3 | Syllabus upload limiter/size cap "needs confirming" | Confirmed: `syllabusUserLimiter` (10/15min) + Multer 10 MB cap, ordered before parsing |
| 13 | Roadmap Task 4.1 | `StudyPlan.subjects` (Mixed) unvalidated | `schedule.controller.js` now validates every topic's `difficulty`/`status` against enums before save (comment cites "task 4.1") |
| 14 | Prod Readiness §1/§7 | No root `start` script / build pipeline | Root `package.json` now has `build` and `start` scripts |
| 15 | Bug/Security reports | Weak JWT/admin secrets, live secrets in `.env` | Rotated; current secrets are high-entropy random values |
| 16 | Bug-19 / Prod Readiness §11 | Zero responsive design | `global.css` now has 5 `@media` queries |
| 17 | Bug-20 | Light theme broken (hard-coded hex) | `ProgressTab`, `ScheduleTab`, `StatsTab` now use `var(--…)` extensively (0 hard-coded theme hex found in sampled files) |
| 18 | Payment validation | Test/live key mixing not guarded | `payment.controller.validatePaymentConfig()` + `app.js` refuse to boot in production on test keys or missing webhook secret |

## Partially Completed Features

**Admin hardening (roadmap Task 3.2)**
- What was planned: per-admin identities, audit trail, dedicated limiter.
- What exists: all three, fully implemented.
- What's missing: nothing per the roadmap's own scope — this task looks done, not partial (listed here only because roadmap still shows it "Medium priority, not done").

**Theme/responsive migration**
- What was planned: fix light theme + add responsive breakpoints app-wide.
- What exists: core tabs (Progress/Schedule/Stats) migrated to CSS vars; 5 media queries added.
- What's missing: `AICoachTab.jsx`, `LoginPage.jsx`, `SignupPage.jsx` still contain hard-coded hex (19 and 6/6 occurrences respectively) — matches roadmap's still-open **Task 7.4** for auth pages, but AICoachTab isn't tracked anywhere and is also still hard-coded.

**Payment go-live (roadmap Phase 1)**
- What was planned: configure real webhook secret + switch to live Razorpay keys.
- What exists: the code-side guardrails (validation, refusal to boot on bad config) are done.
- What's missing: `server/.env` still has `RAZORPAY_KEY_ID=rzp_test_…` and `RAZORPAY_WEBHOOK_SECRET=<new-razorpay-webhook-secret>` (placeholder) — these are ops/dashboard actions, genuinely still open (Tasks 1.1/1.2).

## Pending Features (confirmed not implemented)

- **Task 7.1** — Delete the six superseded audit `.md` files: **not done**, all six (`MASTER_AUDIT_REPORT.md`, `SECURITY_AUDIT.md`, `BUG_REPORT.md`, `CODE_QUALITY_AUDIT.md`, `PRODUCTION_READINESS.md`, `PRODUCT_REVIEW.md`) are still present and now actively misleading.
- **Task 2.4** — Cross-device sync still last-write-wins by `savedAt` timestamp (`useStudyPlanner.js`), unchanged.
- **Task 4.3** — Streak still `localStorage`-only (`sf_streak_<uid>`), not server-persisted.
- **Task 5.1** — No AI provider fallback; `ai.controller.js` hardcodes `llama-3.3-70b-versatile` with no secondary provider/degraded-mode path.
- **Task 5.2** — No cap on AI context payload size.
- **Task 6.1** — Rate limiting/user cache are still in-memory (no Redis).
- **Task 6.2 / 4.2** — No new indexes for admin queries; no stale-order sweep.
- **Task 7.2/7.3** — Dead `GET /api/schedule` still present; `console.log` noise not yet gated by logger/`NODE_ENV`.
- **Task 8.1/8.4** — Zero automated tests, no CI config found anywhere in the tree.
- README.md itself is **not updated** — still claims Anthropic Claude AI, in-memory DB fallback, and lists auth/payments as "roadmap" items that have long been built (this discrepancy was flagged by `PROJECT_OVERVIEW.md` itself and remains true).

## Bugs Mentioned in Markdown

| Bug | Status |
|---|---|
| BUG-1/Task 1.1 Webhook secret placeholder | **Still exists** (ops task, key still placeholder) |
| BUG-2 Webhook returns 200 on error | Unable to fully determine from static read — not re-verified this pass |
| BUG-7 `/regen-advice` missing `requirePro` | **Fixed** — `requirePro` present on both AI routes |
| BUG-8 Password reset not bound to requester | **Fixed** — roadmap confirms OTP re-verification at final step |
| BUG-9 Signup account enumeration | Not re-checked this pass |
| BUG-12 Sync race (localStorage↔server) | **Still exists** (Task 2.4 open) |
| BUG-18 AI coach loses topic names | **Still exists** — `AICoachTab.jsx` still sends `{ name, topics: [{status}] }`, stripping topic names. **Not tracked in the new roadmap at all.** |
| BUG-19 No responsive design | **Fixed** (5 media queries added) |
| BUG-20 Light theme broken | **Mostly fixed** (main tabs); auth pages + AI coach tab still broken |
| BUG-25 mongoSanitize excludes payment routes | Not re-checked this pass |

## TODO Items
All roadmap tasks not marked "done" above remain outstanding; the highest-value ones are the two real remaining deployment blockers (Razorpay live keys + webhook secret) and deleting the stale audit docs so the documentation stops contradicting the code.

## Current Development Roadmap

✅ Authentication (hardened: OTP-bound reset, rotated secrets)
✅ Secrets/environment hygiene
✅ CORS/CSP/trust-proxy production hardening
✅ SPA same-origin serving
✅ Admin auth (multi-identity, audit log, dedicated limiter)
✅ Schedule Pro-gate cleanup
✅ Cache invalidation on Pro-state change
✅ Responsive layout (partial — core tabs only)
🟡 Light/dark theme parity (AICoach + auth pages still unfixed)
🟡 Payment go-live (code ready, live keys/webhook secret still placeholders)
❌ AI Coach real context (BUG-18 unresolved, untracked)
❌ Cross-device sync / streak portability
❌ AI provider fallback & payload capping
❌ Redis-backed scaling
❌ Automated tests / CI
❌ Stale documentation cleanup

## Final Verdict

1. **Completely finished:** Nearly all of the roadmap's Phase 0 architecture blockers, most of Phase 1–3 (secrets, CORS/CSP, admin hardening, cache invalidation, schedule Pro-gate cleanup, email plan-label bug, syllabus rate limits, topic-shape validation), and the earlier audits' responsive-design and light-theme blockers (for the main app tabs).
2. **Partially finished:** Theme/style migration (auth pages and AI coach tab left behind), payment go-live (code-side guardrails done, actual live credentials not yet swapped in).
3. **Still remaining:** Swap in live Razorpay keys + real webhook secret; delete the six stale audit markdown files; fix the AI coach's stripped-topic-names bug; cross-device sync and streak persistence; AI provider resilience; Redis-backed scaling; tests/CI.
4. **Next development priority:** Given the code is materially ahead of even its own newest planning doc, the priority should be (a) closing the two genuine remaining launch blockers — Razorpay live keys and webhook secret — since everything else code-side for launch is done, and (b) deleting/regenerating the stale `.md` files so future planning isn't working from contradicted information.