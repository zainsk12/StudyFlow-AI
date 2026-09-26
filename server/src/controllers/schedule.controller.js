import StudyPlan        from '../models/StudyPlan.js';

// Hard caps — high enough to never affect real users, low enough to prevent
// a single request from monopolising the event loop inside buildSchedule.
const MAX_SUBJECTS       = 50;
const MAX_TOPICS_PER_SUB = 200;
const MAX_SCHEDULE_DAYS  = 3660;
const MAX_SESSIONS_PER_DAY = 500;

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
  if (schedule.length > MAX_SCHEDULE_DAYS) return false;
  for (const day of schedule) {
    if (!day || typeof day !== 'object' || Array.isArray(day)) return false;
    if (typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return false;
    const date = new Date(`${day.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day.date) return false;
    if (!Array.isArray(day.sessions)) return false;
    if (day.sessions.length > MAX_SESSIONS_PER_DAY) return false;
    for (const session of day.sessions) {
      if (!session || typeof session !== 'object' || Array.isArray(session)) return false;
      for (const key of ['subjectName', 'topicName']) {
        if (typeof session[key] !== 'string') return false;
      }
      for (const key of ['subjectId', 'color', 'topicId']) {
        if (session[key] !== undefined && typeof session[key] !== 'string') return false;
      }
      if (session.difficulty !== undefined && !DIFFICULTIES.includes(session.difficulty)) return false;
      if (typeof session.hours !== 'number' || !Number.isFinite(session.hours) || session.hours <= 0 || session.hours > 24) return false;
    }
  }
  return true;
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
      savedAt: _clientSavedAt, expectedVersion,
    } = req.body;

    if (expectedVersion === undefined) {
      return res.status(428).json({ code: 'EXPECTED_VERSION_REQUIRED', error: 'Refresh planner data before saving.' });
    }
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      return res.status(400).json({ error: '`expectedVersion` must be a non-negative integer.' });
    }

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
      if (isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(examDate) || d.toISOString().slice(0, 10) !== examDate) {
        return res.status(400).json({ error: '`examDate` must be a valid date string.' });
      }
    }

    if (dailyHours !== undefined) {
      if (typeof dailyHours !== 'number' || !Number.isFinite(dailyHours) || dailyHours <= 0 || dailyHours > 24) {
        return res.status(400).json({ error: '`dailyHours` must be a number between 1 and 24.' });
      }
    }

    if (dayIdx !== undefined && (typeof dayIdx !== 'number' || !Number.isSafeInteger(dayIdx) || dayIdx < 0)) {
      return res.status(400).json({ error: '`dayIdx` must be a non-negative integer.' });
    }

    if (overflowCount !== undefined && (typeof overflowCount !== 'number' || !Number.isSafeInteger(overflowCount) || overflowCount < 0)) {
      return res.status(400).json({ error: '`overflowCount` must be a non-negative integer.' });
    }

    if (dayIdx !== undefined && schedule?.length > 0 && dayIdx >= schedule.length) {
      return res.status(400).json({ error: '`dayIdx` must point to an existing schedule day.' });
    }

    // ── Build update payload (only include provided fields) ─────────────────
    const setFields = {
      userId: req.userId,
      ...(subjects      !== undefined && { subjects }),
      ...(examDate      !== undefined && { examDate }),
      ...(dailyHours    !== undefined && { dailyHours }),
      ...(schedule      !== undefined && { schedule }),
      ...(dayIdx        !== undefined && { dayIdx }),
      ...(overflowCount !== undefined && { overflowCount }),
      // Study streak now lives on the server document (Module 1). Only
      // touched when the client actually sends one, so callers that don't
      // know about streaks yet (none currently, but future-proofing) can't
      // accidentally wipe it.
      ...(streak        !== undefined && { streak: { count: streak.count ?? 0, lastDate: streak.lastDate ?? null } }),
      // Sync metadata: stamp every write for sync status and conflict handling.
      lastModified: new Date(),
    };

    let plan;
    const current = await StudyPlan.findOne({ userId: req.userId }).select('version').lean();
    const currentVersion = current ? (current.version ?? 1) : 0;
    if (currentVersion !== expectedVersion) {
      return res.status(409).json({ code: 'PLAN_VERSION_CONFLICT', serverVersion: currentVersion });
    }

    if (!current) {
      plan = await StudyPlan.create({ ...setFields, version: 1 });
    } else {
      const versionFilter = current.version === undefined
        ? { version: { $exists: false } }
        : { version: current.version };
      plan = await StudyPlan.findOneAndUpdate(
        { userId: req.userId, ...versionFilter },
        { $set: { ...setFields, version: currentVersion + 1 } },
        { new: true, runValidators: true }
      );
      if (!plan) {
        const latest = await StudyPlan.findOne({ userId: req.userId }).select('version');
        return res.status(409).json({
          code: 'PLAN_VERSION_CONFLICT',
          serverVersion: latest ? (latest.version ?? 1) : 0,
        });
      }
    }

    res.json({ ok: true, updatedAt: plan.updatedAt, version: plan.version });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/schedule/sync
 *
 * Module 2: Cross-Device Synchronization Engine — status endpoint.
 *
 * Lightweight metadata comparison so the client can decide whether it needs
 * to download or upload, WITHOUT transferring the full planner payload on
 * every check. The client sends the version (and optionally lastModified)
 * it last confirmed the server had; this compares that against the current
 * server document and reports which side is ahead.
 *
 * This endpoint only reports status. PUT /full enforces the version with an
 * atomic compare-and-update; the client presents both copies for user choice
 * when a concurrent update is detected.
 *
 * Purely additive: no existing route, field, or response shape is changed.
 */
export async function getSyncStatus(req, res, next) {
  try {
    const rawVersion      = req.query.version;
    const rawLastModified = req.query.lastModified;

    const clientVersion      = rawVersion      !== undefined ? Number(rawVersion)      : undefined;
    const clientLastModified = rawLastModified !== undefined ? Number(rawLastModified) : undefined;

    const hasClientVersion      = clientVersion      !== undefined && !Number.isNaN(clientVersion);
    const hasClientLastModified = clientLastModified !== undefined && !Number.isNaN(clientLastModified);

    const plan = await StudyPlan.findOne({ userId: req.userId });

    // No server plan yet — nothing to download. If the client already has a
    // version it thinks is synced, treat that as ahead of an empty server so
    // its next debounced save creates the document as usual.
    if (!plan) {
      return res.json({
        exists:             false,
        serverVersion:      0,
        serverLastModified: 0,
        serverSavedAt:      0,
        inSync:             !hasClientVersion || clientVersion === 0,
        serverNewer:        false,
        clientNewer:        hasClientVersion && clientVersion > 0,
      });
    }

    const serverVersion      = plan.version ?? 1;
    const serverLastModified = plan.lastModified ? plan.lastModified.getTime() : 0;
    const serverSavedAt      = plan.updatedAt    ? plan.updatedAt.getTime()    : 0;

    let inSync      = false;
    let serverNewer = false;
    let clientNewer = false;

    if (!hasClientVersion) {
      // Client hasn't told us what it has (first load, or an older client
      // that predates this endpoint) — safest default is "go fetch full
      // plan and compare savedAt yourself", so report server as newer.
      serverNewer = true;
    } else if (clientVersion < serverVersion) {
      serverNewer = true;
    } else if (clientVersion > serverVersion) {
      // Shouldn't happen in normal operation (server always owns the
      // counter), but don't claim staleness that isn't there.
      clientNewer = true;
    } else {
      inSync = true;
      if (hasClientLastModified) {
        clientNewer = clientLastModified > serverLastModified;
      }
    }

    res.json({
      exists: true,
      serverVersion,
      serverLastModified,
      serverSavedAt,
      inSync,
      serverNewer,
      clientNewer,
    });
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
