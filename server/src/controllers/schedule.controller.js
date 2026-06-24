import { buildSchedule } from '../utils/scheduler.js';
import StudyPlan        from '../models/StudyPlan.js';

// Hard caps — high enough to never affect real users, low enough to prevent
// a single request from monopolising the event loop inside buildSchedule.
const MAX_SUBJECTS       = 50;
const MAX_TOPICS_PER_SUB = 200;

// Lightweight structural validators
function isValidSubjects(subjects) {
  if (!Array.isArray(subjects)) return false;
  if (subjects.length > MAX_SUBJECTS) return false;
  for (const s of subjects) {
    if (!s || typeof s !== 'object') return false;
    if (typeof s.name !== 'string' || s.name.trim() === '') return false;
    if (s.topics !== undefined) {
      if (!Array.isArray(s.topics)) return false;
      if (s.topics.length > MAX_TOPICS_PER_SUB) return false;
    }
  }
  return true;
}

function isValidSchedule(schedule) {
  if (!Array.isArray(schedule)) return false;
  for (const day of schedule) {
    if (!day || typeof day !== 'object') return false;
    if (!Array.isArray(day.sessions)) return false;
  }
  return true;
}

/**
 * POST /api/schedule/generate
 */
export async function generate(req, res, next) {
  try {
    const { subjects, examDate, dailyHours } = req.body;

    if (!subjects || !examDate || !dailyHours) {
      return res.status(400).json({
        error: '`subjects`, `examDate`, and `dailyHours` are all required.',
      });
    }

    if (!isValidSubjects(subjects)) {
      return res.status(400).json({
        error: `subjects must be an array of up to ${MAX_SUBJECTS} subjects, each with up to ${MAX_TOPICS_PER_SUB} topics.`,
      });
    }

    const schedule      = buildSchedule(subjects, examDate, Number(dailyHours));
    const overflowCount = 0;

    await StudyPlan.findOneAndUpdate(
      { userId: req.userId },
      { userId: req.userId, examDate, dailyHours: Number(dailyHours), schedule, overflowCount },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      schedule,
      overflowCount,
      totalDays:     schedule.length,
      totalSessions: schedule.reduce((a, d) => a + d.sessions.length, 0),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/schedule
 */
export async function getSchedule(req, res, next) {
  try {
    const plan = await StudyPlan.findOne({ userId: req.userId });
    if (!plan) return res.json(null);

    res.json({
      examDate:      plan.examDate,
      dailyHours:    plan.dailyHours,
      schedule:      plan.schedule,
      totalDays:     plan.schedule.length,
      totalSessions: plan.schedule.reduce((a, d) => a + d.sessions.length, 0),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/schedule/full
 */
export async function getFullPlan(req, res, next) {
  try {
    const plan = await StudyPlan.findOne({ userId: req.userId });
    if (!plan) return res.json(null);

    res.json({
      subjects:      plan.subjects      ?? [],
      examDate:      plan.examDate,
      dailyHours:    plan.dailyHours,
      schedule:      plan.schedule,
      dayIdx:        plan.dayIdx        ?? 0,
      overflowCount: plan.overflowCount ?? 0,
      savedAt:       plan.updatedAt ? plan.updatedAt.getTime() : 0,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/schedule/full
 */
export async function saveFullPlan(req, res, next) {
  try {
    const {
      subjects, examDate, dailyHours, schedule, dayIdx, overflowCount,
      savedAt: _clientSavedAt,
    } = req.body;

    // ── Input validation ───────────────────────────────────────────────────
    if (subjects !== undefined && !isValidSubjects(subjects)) {
      return res.status(400).json({ error: '`subjects` must be an array of valid subject objects.' });
    }

    if (schedule !== undefined && !isValidSchedule(schedule)) {
      return res.status(400).json({ error: '`schedule` must be an array of day objects with `sessions` arrays.' });
    }

    if (examDate !== undefined) {
      const d = new Date(examDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: '`examDate` must be a valid date string.' });
      }
    }

    if (dailyHours !== undefined) {
      const h = Number(dailyHours);
      if (isNaN(h) || h <= 0 || h > 24) {
        return res.status(400).json({ error: '`dailyHours` must be a number between 1 and 24.' });
      }
    }

    if (dayIdx !== undefined && (isNaN(Number(dayIdx)) || Number(dayIdx) < 0)) {
      return res.status(400).json({ error: '`dayIdx` must be a non-negative number.' });
    }

    // ── Build update payload (only include provided fields) ─────────────────
    const setFields = {
      userId: req.userId,
      ...(subjects      !== undefined && { subjects }),
      ...(examDate      !== undefined && { examDate }),
      ...(dailyHours    !== undefined && { dailyHours: Number(dailyHours) }),
      ...(schedule      !== undefined && { schedule }),
      ...(dayIdx        !== undefined && { dayIdx: Number(dayIdx) }),
      ...(overflowCount !== undefined && { overflowCount: Number(overflowCount) }),
    };

    const plan = await StudyPlan.findOneAndUpdate(
      { userId: req.userId },
      { $set: setFields },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ ok: true, updatedAt: plan.updatedAt });
  } catch (err) {
    next(err);
  }
}