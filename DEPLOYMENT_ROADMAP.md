# StudyFlow AI — Deployment Roadmap

**Generated:** 2026-06-26 · **Synchronized:** 2026-07-30
**Status:** Single source of truth. Supersedes all prior audit documents (see `PROJECT_VERIFICATION_JULY_2026.md` for the diff that produced this update).
**Note:** The codebase is now ahead of this roadmap — nearly all Phase 0–4 items below are **done in code**. Only two real launch blockers remain (Task 1.1, 1.2) plus doc cleanup (7.1).

---

## 🚦 Remaining Deployment Blockers

| Task | Title | Status |
|------|-------|--------|
| 1.1 | Configure Razorpay webhook secret | ❌ Open — still placeholder in `server/.env` |
| 1.2 | Switch Razorpay test → live keys | ❌ Open — still `rzp_test_*` |

Everything else formerly listed as a blocker (0.1–0.6, 3.1) is **done in code** — see below.

---

## Phase 0 — Deployment Architecture Blockers — ✅ ALL DONE

- ✅ **0.1/0.2** Same-origin model chosen; `app.js` serves `client/dist` with SPA history fallback, mounted after `/api`.
- ✅ **0.3** `trust proxy` set conditionally via `TRUST_PROXY` env / defaults to `1` in prod.
- ✅ **0.4** Tailored `cspDirectives` in place, plus scoped relaxed CSP for `/admin-panel`.
- ✅ **0.5** Secrets rotated 2026-06-25; `.env.example` placeholders only; startup warns on missing prod vars.
- ✅ **0.6** Mongo SRV DNS guard + connection lifecycle logging/reconnect handlers present in `db.js`.

## Phase 1 — Payment Go-Live Blockers

### Task 1.1 — Configure the Razorpay webhook secret — ❌ still open
Ops/dashboard action. `RAZORPAY_WEBHOOK_SECRET` in `server/.env` is still the placeholder value. Code-side validation/refusal-to-boot is already implemented.

### Task 1.2 — Switch Razorpay from test to live keys — ❌ still open
Ops/dashboard action. `RAZORPAY_KEY_ID` is still `rzp_test_*`.

### Task 1.3 — Fix purchase-confirmation email hardcoding "Lifetime Access" — ✅ DONE
`email.js` now has `planLabelFor()`/`validityFor()` helpers keyed on `planType`.

---

## Phase 2 — Functional Bugs & Correctness

- ✅ **2.1** `/api/schedule/generate` Pro-gate resolved — `requirePro` removed, decision documented in route comment.
- ✅ **2.2** `invalidateUserCache` now called from auth, payment, cancellation, and admin controllers (11 call sites).
- ✅ **2.3** Password-change now has its own `pwdChangeOtp` fields, separate from `resetOtp`/`cancelOtp`.
- ❌ **2.4** Cross-device sync — still last-write-wins by `savedAt` (`useStudyPlanner.js`). **Open.**

---

## Phase 3 — Security Hardening (remaining)

- ✅ **3.1** CORS locked to prod origins — `getAllowedOrigins()` only allows `localhost` in dev.
- ✅ **3.2** Admin auth hardened — named `ADMIN_SECRETS`, constant-time multi-credential matching, structured audit-log lines, dedicated `adminApiLimiter`/`adminPanelLimiter`.
- ✅ **3.3** Syllabus upload confirmed: `syllabusUserLimiter` (10/15min) + Multer 10 MB cap, ordered before parsing.
- ⬜ **3.4** Login/forgot-password timing signal — not re-checked this pass.
- ⬜ **3.5** Atlas IP allowlist tightening — ops task, not re-checked this pass.

---

## Phase 4 — Data Integrity & Reliability

- ✅ **4.1** `StudyPlan.subjects` shape now validated (`difficulty`/`status` enums) before save.
- ❌ **4.2** Orphaned `created` payments — no sweep added. **Open.**
- ❌ **4.3** Streak still `localStorage`-only, not server-persisted. **Open.**

---

## Phase 5 — AI Quality — no change, still open

- ❌ **5.1** No AI provider fallback; `ai.controller.js` hardcodes `llama-3.3-70b-versatile`.
- ❌ **5.2** No cap on AI context payload size.

---

## Phase 6 — Performance & Scaling — no change, still open

- ❌ **6.1** Rate limiting/user cache still in-memory (no Redis).
- ❌ **6.2** No new indexes for admin queries; no stale-order sweep.

---

## Phase 7 — Code Quality & Cleanup

### Task 7.1 — Remove/mark superseded audit markdown files — 🟡 IN PROGRESS
`MASTER_AUDIT_REPORT.md`, `SECURITY_AUDIT.md`, `BUG_REPORT.md`, `CODE_QUALITY_AUDIT.md`, `PRODUCTION_READINESS.md`, `PRODUCT_REVIEW.md` have been marked **OBSOLETE** with a banner (2026-07-30 sync). `PROJECT_OVERVIEW.md` remains current and is kept.

- ❌ **7.2** Dead `GET /api/schedule` still present. **Open.**
- ❌ **7.3** `console.log` noise not yet gated by logger/`NODE_ENV`. **Open.**
- ❌ **7.4** Auth pages (`LoginPage.jsx`, `SignupPage.jsx`) still hard-coded hex. **Open.** (`AICoachTab.jsx` also still hard-coded — untracked, see Bug Tracker below.)

---

## Phase 8 — Nice-to-Have / Post-Launch — no change, still open

- ❌ **8.1/8.4** Zero automated tests, no CI config anywhere in the tree.
- ❌ **8.2** Transactional email still raw Gmail SMTP.
- ❌ **8.3** No readiness/uptime wiring beyond basic `/health`.

---

## Bug Tracker (consolidated from prior audits)

| Bug | Status |
|---|---|
| BUG-1 / Task 1.1 Webhook secret placeholder | ❌ Still open (ops task) |
| BUG-2 Webhook returns 200 on error | Not re-verified this pass |
| BUG-7 `/regen-advice` missing `requirePro` | ✅ Fixed |
| BUG-8 Password reset not bound to requester | ✅ Fixed |
| BUG-9 Signup account enumeration | Not re-checked this pass |
| BUG-12 Sync race (localStorage↔server) | ❌ Still open (= Task 2.4) |
| **BUG-18 AI coach loses topic names** | ❌ **Still open — newly (re)tracked here.** `AICoachTab.jsx` sends `{ name, topics: [{status}] }`, stripping topic names before they reach the system prompt. |
| BUG-19 No responsive design | ✅ Fixed (5 media queries added) |
| BUG-20 Light theme broken | 🟡 Mostly fixed — main tabs (Progress/Schedule/Stats) done; `AICoachTab.jsx`, `LoginPage.jsx`, `SignupPage.jsx` still hard-coded (= Task 7.4) |
| BUG-25 mongoSanitize excludes payment routes | Not re-checked this pass |

---

## Recommended Execution Order

1. **Task 1.1 + 1.2** — the only two genuine remaining launch blockers.
2. **BUG-18** — fix AI coach topic-name stripping (previously untracked).
3. **Task 7.1** — finish removing/archiving the obsolete audit docs.
4. Phase 2/4 remaining items (2.4, 4.2, 4.3) as bandwidth allows.
5. Phases 5–8 continuously, post-launch.
