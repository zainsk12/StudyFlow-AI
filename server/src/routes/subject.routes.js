// server/src/routes/subject.routes.js
import { Router }          from 'express';
import {
  getAll, create, update, remove,
  addTopic, updateTopic, removeTopic,
} from '../controllers/subject.controller.js';
import { protect }         from '../middleware/auth.middleware.js';
import { requirePro }      from '../middleware/requirePro.middleware.js';
import { validate, rules } from '../middleware/validate.js';

const router = Router();

// All subject routes require a valid JWT
router.use(protect);

/* Subjects */
router.get('/',       getAll);
router.post('/',      requirePro, validate(rules.createSubject), create);
router.put('/:id',    requirePro, validate(rules.updateSubject), update);
router.delete('/:id', requirePro,                                remove);

/* Topics nested under a subject */
router.post(  '/:id/topics',            requirePro, validate(rules.addTopic),    addTopic);
router.put(   '/:id/topics/:topicId',   requirePro, validate(rules.updateTopic), updateTopic);
router.delete('/:id/topics/:topicId',   requirePro,                              removeTopic);

export default router;