> ⚠️ **OBSOLETE — superseded 2026-07-30.** This audit predates the current codebase. Do not use for current status. See `DEPLOYMENT_ROADMAP.md` and `PROJECT_VERIFICATION_JULY_2026.md` for current, verified status.

---

# Security Audit — StudyFlow AI

> Audit date: 2026-06-24. Assumes production deployment to thousands of students.
> Severity: 🔴 critical · 🟠 high · 🟡 medium · 🟢 low/info.

---

## 0. EXECUTIVE SUMMARY

The single most serious issue is **a fully populated `server/.env` containing live, real credentials checked into the working tree** (`server/.env`). Every secret below must be treated as **compromised and rotated immediately**, regardless of other fixes. Beyond that, the auth and payment logic is reasonably defensive (HttpOnly cookies, bcrypt, HMAC verification, mongo-sanitize, rate limiting, OTP flows), but there are several real authorization, secrets-management, and hardening gaps.

---

## 1. 🔴 Exposed Secrets / API Key Leaks (CRITICAL)

`server/.env` contains real, working secrets in plaintext:

| Secret | Location | Exposure |
|---|---|---|
| MongoDB Atlas connection w/ username+password (value redacted) | `server/.env:11` | **Full DB read/write/delete** to all user, payment, coupon data |
| Groq API key (`gsk_…`) | `server/.env:5` | Billable AI usage |
| Mistral API key | `server/.env:8` | Billable AI usage |
| Gmail address + app password (value redacted) | `server/.env:20-21` | **Send mail as your support address**, account takeover risk |
| Razorpay key id + **key secret** | `server/.env:25-26` | Create/verify payments, read transactions (test keys here, but same pattern in prod) |
| JWT secret | `server/.env:17` | **Forge any user's session token** |
| Admin secret (value redacted) | `server/.env:41` | **Full admin panel access** |

**Actions (do all):**
1. Rotate **every** secret above (new DB user+password, new Groq/Mistral keys, new Gmail app password, new Razorpay keys, new JWT secret, new admin secret).
2. Remove `server/.env` and `client/.env` from disk/history; ship `server/.env.example` with placeholders only (README claims these exist but they don't).
3. Because this is **not currently a git repo**, ensure it's never committed; if it ever was pushed anywhere, assume full compromise.
4. Move production secrets to a secrets manager / platform env vars, never a file in the repo.

Additional notes:
- 🟠 **Weak JWT secret**: a guessable, low-entropy passphrase (value redacted). Use a 256-bit random value. With a weak secret, an attacker who guesses it can mint admin/any-user JWTs.
- 🟠 **Weak admin secret**: ~15 chars, dictionary+pattern (value redacted) guards the **entire** admin API. Use a long random string.
- 🟢 Client-side: `client/.env` is empty of secrets (good — pricing is server-driven, no `VITE_` secrets), and Razorpay `keyId` (public, by design) is returned from the server.

---

## 2. 🟠 Authentication Flaws

- 🟠 **Password reset not bound to requester** (`auth.controller.resetPassword:243`): authorises on the stored `resetVerified` flag, not the OTP or a one-time token. Anyone who knows an email can complete a reset during the 10-min verified window. → Require the OTP (or a signed reset token) on the final reset step. *(also in BUG_REPORT BUG-8)*
- 🟠 **Account enumeration** on signup (`auth.controller.signup:53`) reveals which emails are registered. → Return a generic success/duplicate-handling response or add captcha.
- 🟡 **No MFA / captcha anywhere** — login, signup, forgot-password, and admin login rely solely on rate limiting + secrets.
- 🟡 **Bearer fallback is dead but increases surface** (`auth.middleware:52`) — remove since the token is cookie-only.
- 🟢 Good: bcrypt cost 10, HttpOnly + `SameSite=strict` + `Secure` (in prod) cookie, `tokenVersion` revocation, OTPs hashed with bcrypt and expiring in 10 min, generic login error.

---

## 3. 🟠 Authorization / Broken Access Control

- 🟠 **AI regen endpoint missing `requirePro`** (`ai.routes.js:13`) — free users can invoke a paid feature directly (cost + entitlement bypass). *(BUG-7)*
- 🟠 **Single shared static admin secret** for all admins (`admin.middleware.js`). No per-admin identity, no roles, no audit trail of who deleted a user / granted Pro / ran a broadcast. For a system that can delete users and read all revenue/PII, this is inadequate. → Move to real admin accounts with authn + authz + audit logging.
- 🟡 **Pro gates are inconsistent vs. usage**: `/api/subjects/*` and `/api/schedule/generate` are `requirePro`-gated but **unused**; the actually-used `/api/schedule/full` is **not** Pro-gated (correct, since core planning is free) — but the dead gates create a false sense of enforcement. Confirm the intended free/Pro boundary and gate the *real* endpoints.
- 🟢 Good: resource ownership is enforced on the used data path — `StudyPlan` queries are always scoped by `userId` (`schedule.controller`), and (in the unused subject controller) by `{_id, userId}`. No IDOR observed on live routes.

---

## 4. 🟡 NoSQL Injection

- 🟢 `express-mongo-sanitize` strips `$`-prefixed keys from body/query/params (`app.js:75`).
- 🟠 **But payment routes are excluded** — `/api/payment` mounts before the global `express.json()`+`mongoSanitize` and uses a router-local parser (`app.js:71`, `payment.routes.js:31`). Payment inputs (`couponCode`, `planType`) are string-coerced / whitelisted, so exploitation is unlikely, but the sanitizer should still cover these routes. *(BUG-25)*
- 🟡 Admin user search builds a `$regex` from `req.query.search` (`admin.controller.getUsers:177`) without escaping — not injection, but a malicious admin (or anyone past the weak admin secret) can pass a catastrophic regex (ReDoS) against the users collection.

---

## 5. 🟡 XSS

- 🟢 React escapes by default; no `dangerouslySetInnerHTML` anywhere in the client.
- 🟢 `broadcastEmail` HTML-escapes subject/body before composing the email (`admin.controller.js:365`).
- 🟡 AI/Mistral output is rendered as text (`white-space:pre-wrap`) in the chat — not injected as HTML (good). Keep it that way.
- 🟡 The admin panel (`admin-panel.html`, 1,670 lines of hand-written JS templating) was not line-audited; verify it escapes all user-derived fields (names, emails, coupon notes) before inserting into the DOM, since it renders attacker-controllable data (user names/emails).

---

## 6. 🟠 CSRF

- 🟢 Auth uses `SameSite=strict` cookies, which blocks cross-site form/`fetch` CSRF in modern browsers for state-changing requests.
- 🟠 There is **no anti-CSRF token** as defense-in-depth, and CORS reflects `origin:'null'` and any `http://localhost:*` in dev (`app.js:59-64`). `SameSite=strict` is the only barrier. For payment/admin actions consider double-submit CSRF tokens, and ensure `NODE_ENV=production` in prod so the dev CORS leniency and the `origin:'null'` allowance are disabled.

---

## 7. 🟠 Rate Limiting

- 🟢 Layered limiters: global (100/15m), AI (20/15m), auth (10/15m), OTP (5/10m), forgot-password (3/15m), per-user AI limiter.
- 🟠 **In-memory store** (`express-rate-limit` default, `rateLimiter.js`): ineffective across multiple instances and reset on every deploy/restart. At "thousands of students" you will run >1 instance → limits are per-process and effectively multiplied. → Use a shared store (Redis).
- 🟠 **Admin API has no dedicated brute-force limiter** beyond the global 100/15m, and the secret is weak (§1) — a determined attacker gets many guesses. The `/admin-panel` Basic-auth route also has no specific limiter.
- 🟡 Webhook is intentionally unthrottled (correct for Razorpay retries) but combined with BUG-2 (200-on-error) means a misbehaving sender can't be distinguished.

---

## 8. 🟡 Sensitive Data Exposure

- 🟢 `password`, `tokenVersion`, OTP fields are stripped from API responses (`.select('-password …')` / destructure).
- 🟡 `paymentId` (Razorpay payment id) is shown in the client Settings (`SettingsPanel.js:446`) — low sensitivity but unnecessary exposure.
- 🟡 In dev (`NODE_ENV!=='production'`), the error handler returns stack traces to the client (`errorHandler.js`). Ensure prod sets `NODE_ENV=production` (the shipped `.env` sets `NODE_ENV=development`).
- 🟡 Admin endpoints return full PII (all users' names/emails, payment history, revenue) behind only the shared secret — large blast radius if the secret leaks.
- 🟢 `requestLogger` redacts `secret/token/key/password` query params (good).

---

## 9. 🟡 File Upload Vulnerabilities

- 🟢 Strong handling for the PDF import: `multer` memory storage, 10 MB limit, MIME pre-check **and** a server-side `%PDF` magic-byte check (`syllabus.routes.js:31`), Pro-gated before any AI cost.
- 🟡 No malware/AV scanning and no page/complexity cap on the parsed PDF beyond an 80k-char text slice — a crafted PDF could be CPU-heavy in `pdf-parse`. Memory storage means large/concurrent uploads pressure RAM. Consider a parse timeout and concurrency cap.

---

## 10. 🟡 Dependency / Supply-chain

- 🟡 No lockfile audit was run here, but notable: `pdf-parse@1.1.1` is unmaintained; `express-mongo-sanitize@2.2.0`, `express@4.19.2`, `mongoose@8.5.3` should be checked against current advisories. Run `npm audit` in both `client/` and `server/` and add it (plus Dependabot/renovate) to CI.
- 🟡 Unused deps (`morgan`, `p-limit`) widen the install surface for no benefit — remove.
- 🟡 Razorpay `checkout.js` and Google Fonts are loaded from third-party origins in `index.html` with no SRI/CSP. Add a Content-Security-Policy (helmet's default CSP is **not** enabled here — `helmet()` is used with defaults, but inline styles/scripts and the Razorpay/Groq origins would need an explicit policy).

---

## 11. 🟢 Things Done Well (keep)

- HttpOnly + SameSite=strict + Secure cookies; `tokenVersion` session revocation.
- bcrypt password hashing; OTPs bcrypt-hashed and expiring.
- Razorpay payment **price is read from the DB, never trusted from the client** (`createOrder` ignores body price) — prevents price tampering.
- HMAC signature verification on `/verify` and (when configured) the webhook, using `timingSafeEqual` for the admin secret and Basic-auth comparison.
- `helmet`, `express-mongo-sanitize`, layered rate limiting, centralised error handler that hides 5xx detail in prod.
- Request IDs + query-param redaction in logs.

---

## 12. Prioritised Remediation

1. 🔴 **Rotate all secrets in `server/.env`; remove env files from the repo; switch to a secrets manager.** (§1)
2. 🔴 Replace the weak JWT secret and admin secret with high-entropy values. (§1)
3. 🟠 Add `requirePro` to `/api/ai/regen-advice`. (§3)
4. 🟠 Bind password reset to the OTP / one-time token. (§2)
5. 🟠 Configure `RAZORPAY_WEBHOOK_SECRET` (and fix BUG-2 to retry on error). (BUG_REPORT)
6. 🟠 Move rate-limiting to Redis; add an admin brute-force limiter. (§7)
7. 🟠 Replace shared admin secret with real admin accounts + audit logging. (§3)
8. 🟠 Ensure `NODE_ENV=production` in prod; add an explicit CSP. (§6, §8, §10)
9. 🟡 Extend `mongoSanitize` to payment routes; escape admin `$regex` search input. (§4)
10. 🟡 `npm audit` + Dependabot; remove unused deps. (§10)
