# 📚 StudyFlow AI

> An AI-powered study planner that generates smart schedules, tracks progress, and coaches you through exam prep — built with React and Node.js. Built for study planning, progress tracking, and AI assistance.

---

## ✨ Features

### 🔹 Core features
| Feature | Description |
|---|---|
| Subject & Topic Builder | Add subjects, topics, and tag each with Easy / Medium / Hard difficulty |
| Smart Scheduler | Client-side, difficulty-aware day-by-day plan (hard topics first) |
| Daily Schedule View | Scrollable day strip with session cards showing subject, topic, difficulty, and hours |
| Progress Tracker | One-click topic completion with per-subject and overall progress bars |
| Stats Dashboard | Donut chart (hours/subject), stacked bar (done vs pending), difficulty breakdown |
| Pomodoro timer | Built into the header |
| Export schedule to PDF | Client-side via `jspdf` |
| Study streak counter | localStorage-based |

### 🤖 AI features (available to all signed-in users; rate limited)
| Feature | Description |
|---|---|
| AI Study Coach | Chat coach powered by **Groq** — uses study-plan context |
| PDF Syllabus Import | Upload a syllabus PDF; **Gemini Flash-Lite** extracts structured subjects/topics |
| Smart schedule regeneration | Rebuild the schedule and get AI advice via Groq |

### 👤 Account / Platform
- JWT auth (HttpOnly cookie), OTP-gated password reset and password change

---

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Recharts, Lucide React, jsPDF |
| Backend | Node.js (ESM), Express 4, Helmet, express-rate-limit, express-mongo-sanitize |
| AI | **Groq** for chat and regen advice; **Gemini Flash-Lite** for syllabus parsing |
| Database | MongoDB Atlas + Mongoose (**required** — the app exits on connection failure, no in-memory fallback) |
| Auth | `jsonwebtoken`, `bcryptjs`, `cookie-parser` |
| Email | Nodemailer (Gmail SMTP) |
| Styling | Plain CSS with CSS custom properties (dark/light theme, no Tailwind) |

> See `PROJECT_OVERVIEW.md` for full architecture, routes, and data-model detail.

---

## 📁 Folder Structure

```
StudyFlow-AI/
├── client/              # React frontend (Vite)
│   ├── src/
│   │   ├── components/  # Header, Setup, Schedule, Progress, Stats, AICoach, common
│   │   ├── pages/       # LoginPage, SignupPage
│   │   ├── context/     # AuthContext, ThemeContext
│   │   ├── hooks/       # useStudyPlanner.js — all planner state + actions
│   │   ├── utils/       # scheduler.js — client-side schedule builder + stats
│   │   ├── constants/
│   │   └── styles/global.css
│   └── package.json
├── server/              # Express backend (Node.js)
│   ├── src/
│   │   ├── routes/      # auth, ai, schedule, syllabus
│   │   ├── controllers/
│   │   ├── models/      # User, StudyPlan
│   │   ├── middleware/  # auth, rateLimiter, errorHandler, requestLogger
│   │   └── app.js        # Express bootstrap, serves built SPA (same-origin)
│   └── package.json
├── package.json          # Root build/start scripts
└── README.md
```

---

## 🚀 Getting Started

### 1. Install all dependencies
```bash
npm run install:all
```

### 2. Configure environment variables

**Server** (`server/.env`)
```env
PORT=5000
MONGO_URI=mongodb+srv://...               # required
JWT_SECRET=...
GROQ_API_KEY=...
GEMINI_API_KEY=...
ALLOWED_ORIGINS=https://yourdomain.com
```

### 3. Run in development
```bash
npm run dev          # starts both client (port 3000) and server (port 5000)
```

### 4. Production
```bash
npm run build        # builds client
npm start            # Express serves the built SPA same-origin
```

---

## 🧠 How the Scheduling Algorithm Works

```
1. Flatten all topics from all subjects into a single queue
2. Sort queue:  hard → medium → easy
3. For each day until exam:
   a. Fill dailyHours with sessions from the front of the queue
   b. Cap each session at 2 h
   c. Remaining hours on an unfinished topic roll over to the next day
```

Runs entirely client-side; the server's `/api/schedule/generate` endpoint exists but is not used by the client.

---

## 🤖 AI Coach — How It Works

Every chat message includes a system prompt with exam date, days remaining, daily hours, overall completion %, and every subject/topic/difficulty/status — so the coach gives specific, grounded advice rather than generic tips.

The AI Coach receives a compact summary of subject progress, exam date, and study hours with each request.

---

## 📄 License

MIT © 2025–2026
