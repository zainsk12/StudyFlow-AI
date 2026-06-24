# Bug Report — StudyFlow AI

> Audit date: 2026-06-24. Severity: 🔴 critical · 🟠 major · 🟡 minor. Each item lists file:line and impact.

---

## 1. Payment / Subscription Bugs

### 🔴 BUG-1 — Razorpay webhook is non-functional (placeholder secret)
`server/.env:37` → `RAZORPAY_WEBHOOK_SECRET=replace_this_with_your_razorpay_webhook_secret`.
`handleWebhook` (`payment.controller.js:271`) computes HMAC with that placeholder; every real Razorpay event fails signature check and is dropped. The server even logs this on boot (`app.js:147`). Impact: if the client tab closes after payment capture but before `/verify` completes, **Pro is never granted** despite a successful charge — paid users locked out, support tickets, refunds.

### 🟠 BUG-2 — Webhook swallows errors, returns 200 on failure
`payment.controller.js:344-347` catches all errors and responds `200 {status:'error'}`. Razorpay treats 2xx as success and **never retries**, so a transient DB error permanently loses a paid event. Should return 5xx so Razorpay retries.

### 🟠 BUG-3 — `/api/payment/cancel` immediately revokes Pro with no refund/proration
`cancelSubscription` (`payment.controller.js:366`) sets `isPro=false` and nulls the plan the instant the OTP matches — a yearly/lifetime user loses all remaining paid time with no refund and no record. (Also this endpoint is unused by the UI, which uses the admin-approval flow — see CODE_QUALITY A3 — so the two cancellation paths can disagree.)

### 🟠 BUG-4 — Coupon `usedCount` can desync from reality
`incrementUniqueUse` (`payment.controller.js:98`) bumps `usedCount` only when no prior paid payment with that code exists for the user. But `maxUses` enforcement reads `usedCount` via the `isValid` virtual; concurrent `create-order`/`verify`/webhook for the same coupon can race (read-modify-write without atomic guard), letting a limited coupon exceed `maxUses`. There's even an admin "recalculate-counts" tool — evidence this drifts in practice.

### 🟡 BUG-5 — Disabling a coupon only revokes FREE-coupon users
`updateCoupon` (`admin.controller.js:99`) on `isActive:false` revokes Pro only for users whose `paymentId === 'FREE_COUPON_<code>'`. Users who used the same coupon for a *discounted* (non-free) purchase keep Pro — may or may not be intended, but it's an asymmetry worth confirming.

### 🟡 BUG-6 — Free-coupon path can grant Pro to an already-Pro user inconsistently
`createOrder` checks `user.isPro` at top (`payment.controller.js:111`) but the free-grant uses a conditional `findOneAndUpdate({isPro:{$ne:true}})` and then falls back to the existing user — emailing a "welcome to Pro" receipt even if no state changed.

---

## 2. Authentication / Authorization Bugs

### 🔴 BUG-7 — `regen-advice` AI endpoint is not Pro-gated
`ai.routes.js:13` → `router.post('/regen-advice', protect, aiRateLimiter, aiUserLimiter, regenAdvice)` — **no `requirePro`**. Smart Regenerate is advertised as a Pro feature and gated in the UI (`SmartRegenBanner.jsx:94`), but any authenticated free user can call the endpoint directly and consume paid Groq tokens. Cost/abuse leak.

### 🟠 BUG-8 — Password reset is not bound to the requester
`resetPassword` (`auth.controller.js:243`) accepts `{ email, newPassword }` and authorises solely on the stored `user.resetVerified` flag + OTP expiry. It does **not** require re-submitting the OTP or any session token. Once a victim has verified an OTP (10-min window), any party who knows the email can set a new password by calling `/reset-password`. Bind the reset to the OTP value or a one-time reset token.

### 🟠 BUG-9 — Account enumeration on signup
`signup` (`auth.controller.js:53`) returns `"An account with this email already exists."` Combined with no captcha, this lets an attacker enumerate registered emails. (Login and forgot-password are correctly generic.)

### 🟡 BUG-10 — Pro expiry downgrade is fire-and-forget; status can briefly lie
`auth.middleware.protect` (`auth.middleware.js:92`) downgrades expired plans with an un-awaited `findByIdAndUpdate(...).catch(...)`. If it fails, the user stays Pro in DB; meanwhile the 60s `USER_CACHE` may still serve `isPro:true` to other requests within the window.

### 🟡 BUG-11 — `Bearer` token path is dead/misleading
`protect` supports an `Authorization: Bearer` fallback (`auth.middleware.js:52`), but the JWT lives only in an HttpOnly cookie that JS can't read, and `AuthContext` documents there is no token. The fallback can never be exercised by this client.

---

## 3. Schedule / State Synchronization Bugs

### 🟠 BUG-12 — localStorage↔server reconciliation can resurrect deleted data / lose progress
`pickNewerSource` (`useStudyPlanner.js:82`) trusts a client-set `savedAt`. Across two devices, or after the documented 2s debounce window, the "newer" snapshot may overwrite the correct one. The codebase has layered patches (StrictMode removal, `beforeunload` keepalive flush, hydration gate) around this — a sign the core sync model is unreliable. Multi-device users can see stale subjects/progress.

### 🟠 BUG-13 — Generating a plan resets progress silently in some paths
`SetupTab` warns before overwrite (`ConfirmRegenDialog`), but `App.handleGenerateNew/handleGenerateAnyway` (from the feasibility modal) call `generatePlan()` with no confirmation, and `generatePlan` rebuilds `schedule` from scratch. Topic `status` lives on `subjects` so completion survives, but `dayIdx`/expanded state and the day-by-day mapping reset — confusing after a regen.

### 🟡 BUG-14 — Schedule built with `<exam-date` exclusive boundary
`utils/scheduler.js:36` `daysUntil` uses `Math.max(0, …)`. If the exam date is **today**, `daysLeft=0` and `buildScheduleFrom` runs with `totalDays=max(1,…)` → exactly 1 day; topics beyond capacity overflow with no clear messaging. Past dates produce a degenerate single-day plan.

### 🟡 BUG-15 — `behindCount` ignores the day's partial completion
`useStudyPlanner.behindCount` (`:263`) counts any pending topic that appears on a past day. A topic split across multiple days (scheduler caps sessions at 2h) is counted as "behind" the moment its first day passes even if later sessions are future — can overstate how far behind a user is, triggering the regen banner prematurely.

---

## 4. AI / Syllabus Bugs

### 🟠 BUG-16 — Imported subjects bypass server-side caps and validation
PDF import returns subjects to the client, which merges them into `subjects` and saves via `PUT /api/schedule/full`. `saveFullPlan` caps 50 subjects / 200 topics, but a large syllabus can exceed this and be **rejected on save with a generic 400**, after the user already spent an AI call and selected topics — poor UX and wasted cost.

### 🟡 BUG-17 — Mistral truncation handling can silently drop topics
`syllabus.controller.js:215` warns at >80k chars and slices input; `repairTruncatedJSON` may also drop the trailing (partial) subject. Users get an incomplete syllabus with only a transient SSE warning.

### 🟡 BUG-18 — Chat history sent to server omits subject/topic names
`AICoachTab.send` maps subjects to `{ name, topics:[{status}] }` (`AICoachTab.jsx:97`) — topic names are stripped, so the "context-aware" coach only knows counts, not actual topics, undercutting the core value prop.

---

## 5. UI / Responsive / Navigation Bugs

### 🔴 BUG-19 — No responsive design; header breaks on mobile
`global.css` contains **0 `@media` queries**. The header packs 4 metric blocks + Pomodoro pill + avatar in a single non-wrapping flex row (`Header.jsx:247`), content is `maxWidth:960` with `repeat(4,1fr)` grids (`StatsTab`, `ProfileModal`). On phones these overflow horizontally / squash unreadably. For a student audience that is heavily mobile, this is a serious defect.

### 🟠 BUG-20 — Light theme is broken for most of the app
`ThemeContext` swaps CSS vars, but the vast majority of components use **hard-coded hex** (`#0d1117`, `#1c2030`, `#f1f5f9`, etc.) instead of `var(--…)` — e.g. `SetupTab`, `ScheduleTab`, `ProgressTab`, `StatsTab`, `AICoachTab`, `PaywallModal`, `Login/SignupPage`. Switching to Light mode leaves dark cards/text on a light page → unreadable contrast in many places. Only `Header`, `ProfileModal`, `SettingsPanel` partially use vars.

### 🟠 BUG-21 — Keyboard shortcut hijacks number keys
`App.jsx:96` binds keys `1–5` to tab switching globally, skipping only `INPUT`/`TEXTAREA`. Any focusable non-input element (buttons, `contenteditable`, selects via keyboard) will trigger tab changes; also conflicts with browser/native behaviours and screen-reader navigation.

### 🟡 BUG-22 — `forgot_otp` "Resend code" doesn't resend
`LoginPage.jsx:285` "Resend code" just navigates back to the email screen (`setScreen('forgot_email')`) instead of re-POSTing `/forgot-password`. Misleading label.

### 🟡 BUG-23 — Notifications & reminder-time settings are non-functional
`SettingsPanel` Notifications/Preferences (`:555`, `:621`) persist toggles/time to `localStorage` only. No backend, no scheduler, no email reminders exist. The UI implies a feature that does nothing.

### 🟡 BUG-24 — Subjects with empty names produce "Unnamed" charts / blank schedule rows
`computeStats` falls back to `'Unnamed'`; the schedule/PDF show blank names. Users can generate a plan with unnamed subjects/topics.

---

## 6. Database / Backend Bugs

### 🟠 BUG-25 — `mongoSanitize` does not cover payment routes
`/api/payment` is mounted (`app.js:71`) **before** `express.json()` and `mongoSanitize()` (`app.js:73-75`). Payment route bodies are parsed by a router-local `express.json()` (`payment.routes.js:31`) and never pass through `mongoSanitize`. Inputs like `couponCode`/`planType` are string-coerced/whitelisted so practical risk is low, but the protection is silently absent here.

### 🟡 BUG-26 — `Subject`/`StudyPlan` `Mixed` subjects skip schema validation
`StudyPlan.subjects` is `Schema.Types.Mixed` (`StudyPlan.js:37`); difficulty/status enums are **not** enforced on the real persistence path, unlike the (unused) `Subject` model. Malformed difficulties default-coerce only in scheduler math (`DIFF_HRS[diff] ?? 1`).

### 🟡 BUG-27 — `deleteUser` cascade misses CancellationRequests
`admin.controller.deleteUser` (`:308`) cascades `StudyPlan` and `Payment` deletes but **not** `CancellationRequest` — orphaned records remain, and `adminListRequests` will then `populate` a null user.

### 🟡 BUG-28 — Connection has no retry; one blip exits the process
`config/db.js` calls `process.exit(1)` on any connect error with no retry/backoff — a transient Atlas hiccup at boot crashes the server (and there's no process manager config shipped).

---

## 7. Build / Runtime Warnings

- 🔴 `npm run lint` fails — ESLint 9 with no flat config (`client/` has none). 
- 🟡 `pdf-parse@1.1.1` is known to attempt to read a bundled test PDF if called with no args; not triggered here but the package is unmaintained.
- 🟡 Removing `React.StrictMode` hides would-be warnings for unsafe effects; several effects use `eslint-disable exhaustive-deps`.
- 🟡 Inline `<style>{`@keyframes spin…`}</style>` is injected in multiple components (`PaywallModal`, `ExportPDFButton`, `SyllabusImport`) duplicating the `spin` keyframe already in `global.css`.

---

## Quick repro notes
- **BUG-7**: as a free logged-in user, `POST /api/ai/regen-advice` with a valid cookie returns AI advice (200).
- **BUG-19/20**: open the app at ≤480px width, or toggle Settings → Appearance → Light.
- **BUG-1**: complete a payment, kill the tab before `/verify` resolves → user stays non-Pro; server log shows webhook misconfigured.
