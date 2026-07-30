> ⚠️ **OBSOLETE — superseded 2026-07-30.** This audit predates the current codebase. Do not use for current status. See `DEPLOYMENT_ROADMAP.md` and `PROJECT_VERIFICATION_JULY_2026.md` for current, verified status.

---

# Code Quality Audit — StudyFlow AI

> Audit date: 2026-06-24. Severity tags: 🔴 high · 🟠 medium · 🟡 low. File paths and line references included.

---

## A. Dead Code / Unused Files / Unused APIs

### 🔴 A1. Entire `/api/subjects` stack is dead code
The client **never** calls `/api/subjects/*` (verified by grep — the only schedule/subject endpoint used is `/api/schedule/full`). Subjects are persisted as `StudyPlan.subjects` (Mixed).
- Dead: `server/src/routes/subject.routes.js`, `server/src/controllers/subject.controller.js` (225 lines), and the `Subject` model (`server/src/models/Subject.js`) is written only by that controller.
- Consequence: ~300+ lines of maintained, `requirePro`-gated, validated code that does nothing, plus a duplicated validation layer (`subject.controller` validators **and** `validate.js` `rules.createSubject/updateSubject/addTopic/updateTopic`).

### 🔴 A2. `POST /api/schedule/generate` is dead
`useStudyPlanner.generatePlan()` (`client/src/hooks/useStudyPlanner.js:292`) builds the schedule **in the browser** via `utils/scheduler.js`. The server endpoint `schedule.controller.generate` (`server/src/controllers/schedule.controller.js:36`) and the server-side `server/src/utils/scheduler.js` are never invoked by the app. `GET /api/schedule` (`getSchedule`) is also unused (client uses `/full`).

### 🟠 A3. Duplicate cancellation / OTP implementations
There are **two** `sendCancelOtp` implementations:
- `server/src/controllers/auth.controller.js:268` (route `POST /api/auth/send-cancel-otp`)
- `server/src/controllers/cancellation.controller.js:10` (route `POST /api/cancellation/send-otp`) — **this is the one the client uses** (`SettingsPanel.jsx:374`).
Also `payment.controller.cancelSubscription` + route `POST /api/payment/cancel` (`payment.routes.js:48`) is unused — the product uses the admin-approval cancellation flow, not direct cancel. All of the above (auth `sendCancelOtp` + route, payment `cancelSubscription` + route) are dead.

### 🟠 A4. Unused npm dependencies
- `morgan` — in `server/package.json` but never imported (a custom `requestLogger` is used instead).
- `p-limit` — declared but not imported anywhere.
- Remove to reduce install size and dependency surface.

### 🟡 A5. Unused parameters / vestigial code
- `useStudyPlanner(userId, _token)` — `_token` is never used (`client/src/hooks/useStudyPlanner.js:100`).
- `overflowCount` prop passed to `PlanFeasibilityModal` is intentionally ignored (replaced by `liveOverflowCount`) — pass-through left in `App.jsx:231`.
- `auth.controller.logout` and `logoutAll` are byte-for-byte identical logic (both just bump `tokenVersion`); `logoutAll` adds no extra behaviour.

---

## B. Duplicate Code

- 🟠 **`buildSchedule` exists twice**: `client/src/utils/scheduler.js` and `server/src/utils/scheduler.js` (slightly divergent — server lacks `overflowCount` return shape used by client). Only the client version runs.
- 🟠 **`DIFF_HRS` / `DIFF_ORDER` / difficulty colors** are redefined in at least 4 places: `client/src/constants/index.js`, `client/src/utils/scheduler.js`, `server/src/utils/scheduler.js`, and inline in `SyllabusImport.jsx` (`DIFF_CLR`). Drift risk (client uses easy:1/med:1.5/hard:2.5; keep them in one shared module).
- 🟠 **`apiFetch` helper** duplicated in `LoginPage.jsx:40` and `SignupPage.jsx:27`.
- 🟠 **`localTodayStr` / local-date helpers** reimplemented in `App.jsx`, `useStudyPlanner.js`, `ProgressTab.jsx`, `ScheduleTab.jsx`, `PlanFeasibilityModal.jsx`.
- 🟠 **Two `Card` components**: `client/src/components/common/Card.jsx` and a separate local `Card` inside `SettingsPanel.jsx`.
- 🟡 **safe-user destructuring** (`const { password, tokenVersion, ... } = user.toObject()`) repeated in `auth.controller` and `payment.controller` — extract a `toSafeUser()`.
- 🟡 **Email HTML templates** are large inline string literals duplicated across `email.js` and `admin.controller.broadcastEmail`.

---

## C. Poor Folder Structure / Organisation

- 🟠 `admin.controller.js` mixes coupons, users, broadcast, **and pricing** (pricing block starts at line 419 with a mid-file `import Pricing ...` — imports should be top-of-file). Split into `coupon`, `user`, `pricing`, `broadcast` controllers.
- 🟠 No shared module for constants/difficulty maps between client and server (monorepo has no `packages/shared`).
- 🟡 `config/` lives at `server/` root while everything else is under `server/src/` — inconsistent.
- 🟡 `common/index.jsx` exports `SecLabel/Pill/ProgressBar/MetricCard/EmptyState` but `Card`, `ClearDataModal`, `ErrorBoundary` are separate files in the same folder — inconsistent barrel usage.

---

## D. Anti-patterns

- 🔴 **100% inline styles**. Every component carries large inline `style={{…}}` objects (and per-component `const s = {…}` style maps). No CSS modules / utility classes. This kills reuse, defeats theming for many components (hard-coded hex like `#1c2030`, `#0d1117` ignore the `ThemeContext` light mode), and bloats the JS bundle. Most modals/cards/buttons are **hard-coded dark colors** and will look broken in light theme.
- 🟠 **Business logic in `useStudyPlanner` (429 lines)** mixes persistence, hydration, debounce, streak, scheduling, and CRUD. Hard to test.
- 🟠 **`React.StrictMode` removed** (`main.jsx:13`) to paper over an effect-ordering bug instead of fixing the root cause (the persistence gate). This disables a class of dev-time safety checks app-wide.
- 🟠 **Manual stream/JSON parsing & "repair"** in `syllabus.controller.repairTruncatedJSON` — regex surgery on truncated model output is fragile; prefer constrained/JSON-mode output or a tolerant parser.
- 🟡 `eslint-disable-next-line react-hooks/exhaustive-deps` used in multiple effects (`useStudyPlanner.js:207`, `PomodoroTimer.jsx:127`) — masks real dependency issues.
- 🟡 Magic numbers everywhere (cache TTLs, debounce 2000, poll 15000, 80000 char cap) without a central config.

---

## E. Large Components That Should Be Split

| File | Lines | Problem |
|---|---|---|
| `server/admin-panel.html` | 1,670 | Entire admin SPA in one HTML file (HTML+CSS+JS), no build, no review tooling |
| `client/src/components/Header/SettingsPanel.jsx` | 751 | 6 sections (Appearance/Account/Subscription/Notifications/Security/Preferences) in one file; each should be its own component |
| `client/src/components/Progress/ProgressTab.jsx` | 625 | `DayCard`, modals, banners, two views all inline |
| `client/src/components/Payment/PaywallModal.jsx` | 488 | checkout + coupon + plan UI + style map |
| `client/src/components/Setup/SyllabusImport.jsx` | 423 | upload + SSE parsing + preview tree |
| `client/src/components/Setup/PlanFeasibilityModal.jsx` | 409 | 3 accordion strategies + math |
| `server/src/controllers/admin.controller.js` | 605 | many unrelated concerns (see C) |

---

## F. Performance Bottlenecks

- 🟠 **In-memory rate limiter & user cache** (`rateLimiter.js`, `auth.middleware.js USER_CACHE`) are per-process. With >1 instance behind a load balancer, limits and cache are inconsistent and effectively weaker. Use Redis.
- 🟠 **`StudyPlan.subjects` stored as `Mixed`** and re-serialised on every debounced `PUT /full`. For a heavy syllabus (50 subjects × 200 topics) the full document is rewritten every 2s of activity — write amplification.
- 🟠 **`broadcastEmail`** sends to up to 500 recipients synchronously within one HTTP request (batches of 10) — long-held request, no job queue, blocks on Gmail throughput.
- 🟡 **`AuthContext` polls `/api/auth/me` every 15s** for every logged-in tab indefinitely — unnecessary load at scale (thousands of students = thousands of requests/15s). Prefer event-driven refresh or longer interval/backoff.
- 🟡 `computeStats` and `buildSchedule` run fully on the client on each relevant state change; fine for small data but unbounded (no cap client-side; server caps at 50/200).
- 🟡 Recharts `ResponsiveContainer` re-renders charts on every stats change (acceptable, but charts are not memoised).

---

## G. State Management

- 🟠 **Dual source of truth** (localStorage ⟷ server `savedAt` reconciliation in `pickNewerSource`) is inherently race-prone. The code itself documents multiple bugs it has tried to patch (StrictMode removal, `beforeunload` keepalive flush, hydration gate). This is fragile; a single authoritative store (server, with optimistic UI) would be cleaner.
- 🟠 **`subjects` duplicated** between `StudyPlan.subjects` (Mixed) and the unused `Subject` collection — two schemas for the same concept.
- 🟡 Chat messages live in `App.jsx` state and are **not persisted** — refresh loses the conversation.
- 🟡 Streak is localStorage-only and per-device (`sf_streak_<uid>`), so it desyncs across devices.

---

## H. Error Handling

- 🟢 Centralised `errorHandler` is solid (normalises Razorpay/Mongoose/JWT errors, hides 5xx detail in prod, includes `reqId`).
- 🟠 Many controllers **bypass the central handler** by returning ad-hoc shapes: subject controller uses `{ error: ... }` while auth uses `{ message: ... }` — **inconsistent error envelope** across the API.
- 🟠 Webhook handler swallows errors and returns `200 {status:'error'}` (`payment.controller.js:346`) — Razorpay won't retry; a transient DB failure permanently drops a paid event.
- 🟡 Fire-and-forget `.catch(() => {})` in several places (cache evict, push plan, aiMessageCount increment) silently hides failures with no logging/metric.
- 🟡 `connectDB` logs with `console.log(error)` then `process.exit(1)` — no structured log, no retry/backoff.

---

## I. Missing Loading / Empty / Validation States

**Loading** — generally good (Paywall, SyllabusImport, AICoach, SettingsPanel all show spinners). Gaps:
- 🟡 `AuthContext` initial load shows a bare "Loading…" but the 15s poll and focus refetch have no UI; a silent `/me` 500 just leaves stale state.

**Empty states** — present for schedule (`ScheduleTab` `EmptyState`), subjects (`SetupTab` dashed box), progress (no-schedule box). Gaps:
- 🟡 Stats tab renders charts even with **zero subjects** → empty donut/bar with no "add subjects first" message (`StatsTab.jsx`).
- 🟡 Paywall "No active plans available" is handled, good.

**Validation** — client mirrors server password rules (good). Gaps:
- 🟠 **Exam date is not validated to be in the future** on the client setup (`SetupTab` date input has no `min`); a past date yields `daysLeft = 0` and a 1-day schedule. Server `saveFullPlan` only checks it parses.
- 🟠 `dailyHours` server validation differs by endpoint: `generateSchedule` rule only checks finite (`validate.js:129`), `saveFullPlan` checks 1–24, `StudyPlan` schema enforces 0.5–24 — **inconsistent bounds**.
- 🟡 Subject/topic names allow empty strings in the client UI (blank inputs) until generation; server `Subject` requires non-empty but that path is unused.
- 🟡 Coupon `discountPct` min is 10 — a 5% promo is impossible by design (likely unintended business constraint).

---

## J. Tooling / Build Quality

- 🔴 **`npm run lint` is broken**: ESLint 9 requires a flat `eslint.config.js`; none exists (`client/` has no eslint config). Lint cannot run → no static analysis gate.
- 🔴 **Zero automated tests** (no `*.test`/`*.spec`, no test runner). For a payments + auth product this is a major gap.
- 🟠 No TypeScript / PropTypes — large prop drilling (e.g. `Header` takes ~14 props; `SetupTab` ~20) with no type safety.
- 🟠 No `.env.example` files actually present (README references them; the repo ships real `.env` instead — see SECURITY_AUDIT).
- 🟡 No CI, no Dockerfile, no `engines` field, no `start` script at root.
