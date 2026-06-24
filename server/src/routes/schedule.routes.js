// server/src/routes/schedule.routes.js
import { Router }          from 'express';
import { generate, getSchedule, getFullPlan, saveFullPlan } from '../controllers/schedule.controller.js';
import { protect }         from '../middleware/auth.middleware.js';
import { requirePro }      from '../middleware/requirePro.middleware.js';
import { validate, rules } from '../middleware/validate.js';

const router = Router();

// All schedule routes require a valid JWT
router.use(protect);

// GET  /api/schedule          — reading saved plan is free (no Pro gate)
router.get('/',          getSchedule);

// POST /api/schedule/generate — generating a plan is a Pro feature
router.post('/generate', requirePro, validate(rules.generateSchedule), generate);

// GET  /api/schedule/full     — fetch complete planner state (free, own data)
router.get('/full',      getFullPlan);

// PUT  /api/schedule/full     — save complete planner state (free, own data)
router.put('/full',      saveFullPlan);

export default router;