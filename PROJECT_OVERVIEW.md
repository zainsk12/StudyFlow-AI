# StudyFlow AI — Project Overview

## Purpose

StudyFlow AI is a web application for planning exam study, tracking topic completion, and getting AI study assistance. A user creates subjects and topics, sets an exam date and daily study time, and gets a day-by-day schedule with account management.

## Main capabilities

- Create subjects and topics, with difficulty levels, and build a schedule from the exam date and available study hours.
- View daily sessions and mark topics complete; review progress, statistics, and study streaks.
- Export a schedule to PDF.
- Use the AI coach, import a PDF syllabus to extract structured subjects and topics, and get AI advice when regenerating a schedule. These AI features are available to all signed-in users.

The schedule builder and progress calculations are in the browser. The server provides schedule persistence and synchronization endpoints; schedule generation is not performed through a server generation endpoint by the current client.

## Technology

| Area | Implementation |
|---|---|
| Client | React 18, Vite, JavaScript, Recharts, Lucide React, jsPDF, plain CSS and CSS custom properties |
| Server | Node.js ES modules, Express 4 |
| Database | MongoDB through Mongoose; database connection is required at startup |
| Authentication | JWT in an HttpOnly cookie, bcryptjs password hashing, OTP flows for password recovery and password change |
| AI | Groq for chat and schedule regeneration advice; Gemini Flash-Lite for syllabus extraction |
| Email | Nodemailer SMTP integration |

Client navigation is implemented as application state rather than a routing library. The styling uses CSS and inline styles; there is no CSS framework in the client dependencies.

## Repository layout

```text
client/
  src/
    components/       Feature UI: setup, schedule, progress, stats, AI, header, common
    context/          Authentication and theme providers
    hooks/            useStudyPlanner: planner state, hydration, persistence, and actions
    pages/            Login and signup screens
    utils/            Client schedule construction and statistics
    styles/           Global styles and theme variables
  vite.config.js      Development server and API proxy configuration
server/
  config/             MongoDB connection
  src/
    app.js            Express setup, middleware, route mounts, and production SPA serving
    controllers/      Authentication, AI, schedule, syllabus
    middleware/       Authentication, authorization, validation, rate limits, errors, logging
    models/           Mongoose schemas
    routes/           API route definitions
    utils/            Email helpers
package.json          Root development, build, install, and start scripts
```

## Runtime architecture

```text
Browser: React + Vite in development
  ├─ localStorage for fast per-user planner snapshots
  └─ /api requests with credentials
         │
         ├─ Development: Vite proxies API requests to Express
         └─ Production: Express serves client/dist and handles API on the same origin
                    │
                    ├─ Authentication and application services
                    ├─ MongoDB via Mongoose
                    ├─ Groq and Gemini APIs
                    └─ SMTP email provider
```

The planner hook initializes from the current user's localStorage snapshot, then hydrates from `GET /api/schedule/full`. It compares the local and server snapshot timestamps when both exist, keeps the newer snapshot, and mirrors planner updates to localStorage and the server. Server writes are debounced; a page lifecycle flush is also implemented. The API includes a version-based sync status endpoint and a one-time migration endpoint for legacy local study streaks. These endpoints support planner persistence and sync status; the sync endpoint itself reports freshness and does not merge conflicting data.

## Client responsibilities

- `App.jsx` coordinates the signed-in and signed-out experiences, tab navigation, and app-level dialogs.
- `AuthContext.jsx` manages session state and account information through the authentication API.
- `ThemeContext.jsx` provides dark, light, and system theme selection.
- `useStudyPlanner.js` owns planner state, local/server hydration and persistence, and study actions.
- `utils/scheduler.js` builds the schedule and derives planner statistics in the browser.
- Feature components are grouped by area under `components/` (Setup, Schedule, Progress, Stats, AICoach, Header, and common UI).

## Server responsibilities and API surface

`server/src/app.js` configures proxy trust, Helmet security headers, CORS, cookie parsing, request parsing, MongoDB sanitization, request logging, and rate limits. It connects to MongoDB and mounts the API routes. In production, Express serves the built client from `client/dist` when that directory exists.

| Base path | Purpose | Access pattern |
|---|---|---|
| `/api/auth` | Signup, login/logout, session lookup, profile, OTP and password flows | Public or authenticated by endpoint |
| `/api/schedule` | Full planner read/write, sync status, streak migration | Authenticated; user-owned data |
| `/api/ai` | AI coach chat and regeneration advice | Authenticated account; rate limited |
| `/api/syllabus` | PDF syllabus import and extraction | Authenticated account; rate limited and upload validated |
| `/health` | Basic health response and process uptime | Public |

The client planner's persistent data is stored in `StudyPlan` through `/api/schedule/full`. Schedule route definitions contain only full-plan persistence, sync status, and streak migration; the current API does not expose subject CRUD or schedule-generation routes.

## Data model

- **User** — account credentials, token version, and password recovery/change OTP state.
- **StudyPlan** — one user-owned planner document containing exam date, daily hours, subjects/topics, day sessions, streak, and sync metadata (`version`, `lastModified`, and streak migration state).

## Important flows

### Authentication

Signup validates and stores a password hash. Login verifies credentials and issues a signed JWT in the `sf_token` HttpOnly cookie. Protected routes validate the token and user token version. Logout invalidates a token by advancing the token version. Password recovery and authenticated password changes use separate OTP state and email delivery.

### Planner persistence

The client stores per-user planner snapshots locally for quick startup and communicates with the authenticated full-plan endpoints. The server validates key parts of the submitted plan, upserts the user's `StudyPlan`, increments its version, and updates its modification timestamp. The streak migration endpoint adopts legacy local streak data at most once and avoids replacing an existing non-empty server streak.

### AI and syllabus import

The AI chat endpoint builds its request from exam date, daily study hours, progress, and per-subject completion counts, then sends it to Groq. Schedule regeneration advice also uses Groq. Syllabus import accepts a PDF upload, limits it to 10 MB, checks its PDF signature bytes after upload, extracts text, then sends it to Gemini Flash-Lite for structured subject/topic data. AI chat, schedule regeneration advice, and syllabus import require an authenticated account and apply rate limits.

## Local development and deployment

The root scripts in `package.json` start the client and server together (`npm run dev`), install dependencies across the three package locations (`npm run install:all`), build the client (`npm run build`), and start the server (`npm start`). The client package also provides Vite development/build/preview scripts and a lint script.

The client Vite configuration proxies API requests to the server during development. For production, build the client so `client/dist` exists, then start the server; Express serves the built app when the directory is present. MongoDB connectivity is required for the server to operate.

Configuration is read from environment variables. See `server/.env.example` and `client/.env.example` for the variables expected by this checkout. Do not copy real credentials from local `.env` files into documentation or source control. Deployment-sensitive settings include database connection, JWT signing, allowed origins, AI provider credentials, and SMTP settings.

## Maintenance notes

- Keep this overview aligned with the actual files and routes in the repository when architecture changes.
- Treat `server/src/routes/` as the source for the exposed API surface and `server/src/models/` as the source for persisted entity structure.
- Keep provider model names and environment variable guidance consistent with the controller implementations and example environment files.
- The local/server planner freshness comparison uses timestamps; `/api/schedule/sync` exposes version and modification metadata but does not implement conflict resolution.