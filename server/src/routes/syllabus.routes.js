// server/src/routes/syllabus.routes.js
import express from 'express';
import multer  from 'multer';
import { importSyllabus }  from '../controllers/syllabus.controller.js';
import { protect }         from '../middleware/auth.middleware.js';
import { aiRateLimiter, userRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// PDF import calls Gemini after extracting text and buffers the uploaded file in
// memory, so it carries the same cost/abuse protection as the AI chat routes —
// an IP limiter plus a per-user limiter. PDF imports are infrequent, so the
// per-user budget is tighter than chat (10 / 15 min).
const syllabusUserLimiter = userRateLimiter(10, 15);

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    // First-pass check on the browser-supplied MIME type.
    // This is NOT sufficient on its own — a malicious client can spoof it.
    // A second, buffer-level check (verifyPDFMagicBytes) runs after upload.
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

/**
 * Fix for: "Multer MIME type check is client-controllable"
 *
 * file.mimetype comes from the HTTP Content-Type header, which is set by the
 * client and trivially spoofable.  This middleware inspects the actual bytes
 * of the uploaded buffer: every valid PDF starts with the 4-byte magic number
 * %PDF (0x25 0x50 0x44 0x46).  Any file that fails this check is rejected
 * regardless of what the client claimed its MIME type was.
 */
function verifyPDFMagicBytes(req, res, next) {
  if (!req.file) return next();

  const buf = req.file.buffer;
  const isPDF =
    buf.length >= 4 &&
    buf[0] === 0x25 &&   // %
    buf[1] === 0x50 &&   // P
    buf[2] === 0x44 &&   // D
    buf[3] === 0x46;     // F

  if (!isPDF) {
    return res.status(400).json({
      error: 'Uploaded file is not a valid PDF (magic-byte check failed).',
    });
  }

  next();
}

// protect → rate limits → parse PDF → verify real bytes → controller
// Every signed-in user can import a syllabus; rate limits apply before the PDF is buffered.
// Rate limits run before Multer so an over-limit request is rejected before the
// file is buffered into memory.
router.post(
  '/import',
  protect,
  aiRateLimiter,
  syllabusUserLimiter,
  upload.single('pdf'),
  verifyPDFMagicBytes,
  importSyllabus,
);

export default router;
