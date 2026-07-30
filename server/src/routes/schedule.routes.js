// server/src/routes/schedule.routes.js
import { Router }          from 'express';
import { generate, getSchedule, getFullPlan, saveFullPlan, migrateStreak, getSyncStatus } from '../controllers/schedule.controller.js';
import { protect }         from '../middleware/auth.middleware.js';
import { validate, rules } from '../middleware/validate.js';

const router = Router();

// All schedule routes require a valid JWT
router.use(protect);

// GET  /api/schedule          — reading saved plan is free (no Pro gate)
router.get('/',          getSchedule);

// POST /api/schedule/generate — server-side schedule build + persist.
// Schedule generation is a FREE feature: the client builds schedules locally
// for every user with the same algorithm, so this endpoint is intentionally
// NOT Pro-gated. It previously carried requirePro, which contradicted the
// free client behaviour (roadmap task 2.1). Auth (protect) is still required
// since it writes the caller's own plan.
router.post('/generate', validate(rules.generateSchedule), generate);

// GET  /api/schedule/full     — fetch complete planner state (free, own data)
router.get('/full',      getFullPlan);

// PUT  /api/schedule/full     — save complete planner state (free, own data)
router.put('/full',      saveFullPlan);

// POST /api/schedule/streak/migrate — one-time localStorage -> MongoDB streak
// migration (Module 1). Idempotent; safe to call even if already migrated.
router.post('/streak/migrate', migrateStreak);

// GET /api/schedule/sync — Module 2: lightweight version/revision comparison
// so the client can decide whether to download or upload without always
// transferring the full plan. Free, own-data only (same auth gate as /full).
router.get('/sync', getSyncStatus);

export default router;