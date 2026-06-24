# 📚 StudyFlow AI

> An intelligent, AI-powered study planner that generates smart schedules, tracks progress, and coaches you through exam prep — built with React, Node.js, and Claude AI.

---

## ✨ Features

### 🔹 Core
| Feature | Description |
|---|---|
| Subject & Topic Builder | Add subjects, topics, and tag each with Easy / Medium / Hard difficulty |
| Smart Scheduler | Auto-generates a day-by-day plan that front-loads hard topics |
| Daily Schedule View | Scrollable day strip with session cards showing subject, topic, difficulty, and hours |
| Progress Tracker | One-click topic completion with per-subject and overall progress bars |
| Stats Dashboard | Donut chart (hours/subject), stacked bar (done vs pending), difficulty breakdown |
| AI Study Coach | Chat with Claude — it knows your full plan, exam date, and progress |

### 🔥 Advanced
- **Difficulty-aware scheduling** — hard topics always come first while your focus is sharpest
- **2-hour session caps** — prevents burnout by splitting long topics across days
- **Adaptive rollover** — unfinished topic hours carry over to the next day automatically
- **Live stats strip** — days left, completion %, topic count, and total hours always visible
- **Context-aware AI** — the coach receives your complete plan in every message

---

## 🛠 Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Recharts, Lucide React |
| Backend | Node.js, Express 4, Helmet, Morgan |
| AI | Anthropic Claude (`claude-sonnet-4`) via `@anthropic-ai/sdk` |
| Database | MongoDB + Mongoose (optional — in-memory store works out of the box) |
| Styling | Plain CSS with CSS custom properties (no Tailwind dependency) |

---

## 📁 Folder Structure

```
StudyFlow-AI/
│
├── client/                         # React frontend (Vite)
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/             # Card, Pill, ProgressBar, MetricCard, EmptyState
│   │   │   ├── Header/             # Top nav + live stats strip
│   │   │   ├── Setup/              # Exam config + subject/topic editor
│   │   │   ├── Schedule/           # Day strip + session detail cards
│   │   │   ├── Progress/           # Topic checklist + progress bars
│   │   │   ├── Stats/              # Charts + subject breakdown table
│   │   │   └── AICoach/            # Claude-powered chat coach
│   │   ├── hooks/
│   │   │   └── useStudyPlanner.js  # All planner state + actions
│   │   ├── utils/
│   │   │   └── scheduler.js        # Pure scheduling & stats functions
│   │   ├── constants/
│   │   │   └── index.js            # Colors, difficulty maps, seed data
│   │   ├── styles/
│   │   │   └── global.css          # Global styles, CSS variables, animations
│   │   ├── App.jsx                 # Root component + tab router
│   │   └── main.jsx                # ReactDOM entry point
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
│
├── server/                         # Express backend (Node.js)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── ai.routes.js        # POST /api/ai/chat
│   │   │   ├── schedule.routes.js  # POST /api/schedule/generate
│   │   │   └── subject.routes.js   # CRUD /api/subjects
│   │   ├── controllers/
│   │   │   ├── ai.controller.js    # Anthropic API proxy + system prompt builder
│   │   │   ├── schedule.controller.js
│   │   │   └── subject.controller.js
│   │   ├── models/
│   │   │   ├── Subject.js          # Mongoose subject + topic schema
│   │   │   └── StudyPlan.js        # Mongoose study plan schema
│   │   ├── middleware/
│   │   │   ├── errorHandler.js     # Centralised error responses
│   │   │   └── rateLimiter.js      # Global + AI-specific rate limits
│   │   ├── utils/
│   │   │   └── scheduler.js        # Server-side scheduling algorithm
│   │   └── app.js                  # Express bootstrap + route registration
│   ├── .env.example
│   └── package.json
│
├── .gitignore
├── package.json                    # Root scripts (dev, install:all)
└── README.md
```

---

## 🚀 Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/your-username/studyflow-ai.git
cd studyflow-ai
```

### 2. Install all dependencies
```bash
npm run install:all
```

### 3. Configure environment variables

**Client** (`client/.env`)
```env
VITE_ANTHROPIC_API_KEY=your_key_here   # for dev only; use server proxy in prod
```

**Server** (`server/.env`)
```env
PORT=5000
ANTHROPIC_API_KEY=your_key_here
MONGODB_URI=mongodb://localhost:27017/studyflow   # optional
CLIENT_URL=http://localhost:3000
```

### 4. Run in development
```bash
npm run dev          # starts both client (port 3000) and server (port 5000)
# — or individually —
npm run client
npm run server
```

---

## 🧠 How the Scheduling Algorithm Works

```
1. Flatten all topics from all subjects into a single queue
2. Sort queue:  hard → medium → easy
   (hardest material when focus is sharpest — proven study science)
3. For each day until exam:
   a. Fill `dailyHours` with sessions from the front of the queue
   b. Cap each session at 2 h to prevent cognitive fatigue
   c. Remaining hours on an unfinished topic roll over to the next day
4. Return array of { date, sessions[] }
```

No heavy ML required — this rule-based system produces genuinely useful, personalised schedules and is fully explainable in interviews.

---

## 🤖 AI Coach — How It Works

Every message to the AI coach includes a rich system prompt containing:
- Exam date and days remaining
- Daily available hours
- Overall completion percentage
- Every subject, topic, difficulty, and completion status

This means Claude can give **specific, grounded advice** rather than generic tips:

> *"You have 12 days left and Mechanics (hard) is still pending. I'd prioritise it for the next 3 mornings — aim for a full 2-hour block while fresh."*

---

## 📡 API Reference

### `POST /api/ai/chat`
```json
{
  "messages":   [{ "role": "user", "content": "How should I prioritise?" }],
  "subjects":   [...],
  "examDate":   "2025-08-20",
  "dailyHours": 4,
  "stats":      { "pct": 35, "daysLeft": 18, ... }
}
```
**Response:** `{ "reply": "string" }`

### `POST /api/schedule/generate`
```json
{ "subjects": [...], "examDate": "2025-08-20", "dailyHours": 4 }
```
**Response:** `{ "schedule": [...], "totalDays": 24, "totalSessions": 72 }`

### `GET /api/subjects` — list all subjects
### `POST /api/subjects` — create subject
### `PUT /api/subjects/:id` — update subject
### `DELETE /api/subjects/:id` — delete subject
### `POST /api/subjects/:id/topics` — add topic
### `PUT /api/subjects/:id/topics/:topicId` — update topic
### `DELETE /api/subjects/:id/topics/:topicId` — delete topic

---

## 🔮 Roadmap / Bonus Add-ons

- [ ] User authentication (JWT + MongoDB)
- [ ] Export schedule as PDF
- [ ] Dark / Light mode toggle
- [ ] Adaptive replanning — auto-adjust schedule when a day is skipped
- [ ] Pomodoro timer built into session cards
- [ ] Spaced repetition reminders via email

---

## 📸 Screenshots

> _Add screenshots of Setup, Schedule, Progress, Stats, and AI Coach tabs here._

---

## 📄 License

MIT © 2025 — built with ❤️ using React + Claude AI
