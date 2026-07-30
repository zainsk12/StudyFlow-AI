import { buildSchedule } from '../utils/scheduler.js';
import StudyPlan        from '../models/StudyPlan.js';

// Hard caps — high enough to never affect real users, low enough to prevent
// a single request from monopolising the event loop inside buildSchedule.
const MAX_SUBJECTS       = 50;
const MAX_TOPICS_PER_SUB = 200;

// Lightweight structural validators
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const STATUSES     = ['pending', 'done'];

// Validate a single topic's shape (task 4.1). Tolerates absent optional fields
// (the client can briefly hold an unnamed topic) but rejects wrong types and
// out-of-enum difficulty/status — the values that would otherwise corrupt
// schedule math (DIFF_HRS lookups) and progress/behind-count calculations.
function isValidTopic(t) {
  if (!t || typeof t !== 'object') return false;
  if (typeof t.name !== 'string') return false;
  if (t.id !== undefined && typeof t.id !== 'string') return false;
  if (t.difficulty !== undefined && !DIFFICULTIES.includes(t.difficulty)) return false;
  if (t.status !== undefined && !STATUSES.includes(t.status)) return false;
  return true;
}

function isValidSubjects(subjects) {
  if (!Array.isArray(subjects)) return false;
  if (subjects.length > MAX_SUBJECTS) return false;
  for (const s of subjects) {
    if (!s || typeof s !== 'object') return false;
    if (typeof s.name !== 'string' || s.name.trim() === '') return false;
    if (s.id !== undefined && typeof s.id !== 'string') return false;
    if (s.color !== undefined && typeof s.color !== 'string') return false;
    if (s.topics !== undefined) {
      if (!Array.isArray(s.topics)) return false;
      if (s.topics.length > MAX_TOPICS_PER_SUB) return false;
      // task 4.1: validate every topic's shape, not just the array length.
      for (const t of s.topics) {
        if (!isValidTopic(t)) return false;
      }
    }
  }
  return true;
}

// Validate the optional streak object (task 4.3).
function isValidStreak(streak) {
  if (streak === undefined || streak === null) return true;
  if (typeof streak !== 'object') return false;
  if (streak.count !== undefined &&
      (typeof streak.count !== 'number' || !Number.isFinite(streak.count) || streak.count < 0)) return false;
  if (streak.lastDate !== undefined && streak.lastDate !== null && typeof streak.lastDate !== 'string') return false;
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

      // ── Study streak + sync metadata (Module 1, additive fields only) ─────
      streak:                          plan.streak ?? { count: 0, lastDate: null },
      version:                         plan.version ?? 1,
      lastModified:                    plan.lastModified ? plan.lastModified.getTime() : 0,
      migratedStreakFromLocalStorage:  plan.migratedStreakFromLocalStorage ?? false,
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
      subjects, examDate, dailyHours, schedule, dayIdx, overflowCount, streak,
      savedAt: _clientSavedAt,
    } = req.body;

    // ── Input validation ───────────────────────────────────────────────────
    if (subjects !== undefined && !isValidSubjects(subjects)) {
      return res.status(400).json({ error: '`subjects` must be an array of valid subject objects.' });
    }

    if (streak !== undefined && !isValidStreak(streak)) {
      return res.status(400).json({ error: '`streak` must be an object with a non-negative numeric `count` and an optional string `lastDate`.' });
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
      // Study streak now lives on the server document (Module 1). Only
      // touched when the client actually sends one, so callers that don't
      // know about streaks yet (none currently, but future-proofing) can't
      // accidentally wipe it.
      ...(streak        !== undefined && { streak: { count: streak.count ?? 0, lastDate: streak.lastDate ?? null } }),
      // Sync metadata: stamp every write so a future sync module always has
      // an up-to-date "last modified" marker to compare against.
      lastModified: new Date(),
    };

    const plan = await StudyPlan.findOneAndUpdate(
      { userId: req.userId },
      { $set: setFields, $inc: { version: 1 } },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ ok: true, updatedAt: plan.updatedAt, version: plan.version });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/schedule/streak/migrate
 *
 * One-time migration of a client's legacy `localStorage` streak
 * (`sf_streak_<uid>`) onto the server-side StudyPlan document. This does
 * NOT implement general synchronization — it is a single, idempotent
 * "adopt this value if the server doesn't already have one" operation,
 * guarded by `migratedStreakFromLocalStorage` so it can never run twice
 * (and therefore can never clobber real server progress on a retry).
 *
 * Safe for brand-new users who have never generated a plan: examDate/
 * dailyHours fall back to schema defaults so the upsert succeeds.
 */
export async function migrateStreak(req, res, next) {
  try {
    const { count, lastDate } = req.body || {};

    if (!isValidStreak({ count, lastDate })) {
      return res.status(400).json({ error: '`count` must be a non-negative number and `lastDate` an optional string.' });
    }

    const existing = await StudyPlan.findOne({ userId: req.userId });

    // Migration already ran (successfully or as a no-op) — never touch the
    // streak again via this endpoint, regardless of what the client sends.
    if (existing?.migratedStreakFromLocalStorage) {
      return res.json({
        migrated: false,
        streak:   existing.streak ?? { count: 0, lastDate: null },
        version:  existing.version ?? 1,
      });
    }

    // Only adopt the incoming legacy value if the server doesn't already
    // have real streak progress of its own — guards against a stale local
    // copy overwriting genuine server-side data in any edge case.
    const serverStreak = existing?.streak ?? { count: 0, lastDate: null };
    const shouldAdopt  = !serverStreak.count && !serverStreak.lastDate;

    const updated = await StudyPlan.findOneAndUpdate(
      { userId: req.userId },
      {
        $set: {
          userId: req.userId,
          migratedStreakFromLocalStorage: true,
          lastModified: new Date(),
          ...(shouldAdopt && {
            streak: { count: count ?? 0, lastDate: lastDate ?? null },
          }),
        },
        $inc: { version: 1 },
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      migrated: shouldAdopt,
      streak:   updated.streak,
      version:  updated.version,
    });
  } catch (err) {
    next(err);
  }
}