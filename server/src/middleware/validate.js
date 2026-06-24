/**
 * Centralized request validation middleware factory.
 *
 * Usage:
 *   import { validate, rules } from '../middleware/validate.js';
 *   router.post('/signup', validate(rules.signup), signup);
 *
 * validate(schema) returns an Express middleware that checks req.body fields
 * against the schema. On failure it responds 400 with a `message` string that
 * names the first failing field — consistent with the rest of the API.
 *
 * Each rule is a function: (value, body) => errorString | null
 * Returning a string means validation failed; null means it passed.
 */

// ── Primitive helpers ──────────────────────────────────────────────────────

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

function isString(v)  { return typeof v === 'string'; }
function notEmpty(v)  { return isString(v) && v.trim().length > 0; }

export const r = {
  required: (label) => (v) =>
    (v === undefined || v === null || (isString(v) && v.trim() === ''))
      ? `${label} is required.`
      : null,

  string: (label) => (v) =>
    v !== undefined && !isString(v) ? `${label} must be a string.` : null,

  minLen: (label, min) => (v) =>
    notEmpty(v) && v.trim().length < min
      ? `${label} must be at least ${min} characters.`
      : null,

  maxLen: (label, max) => (v) =>
    isString(v) && v.trim().length > max
      ? `${label} must be ${max} characters or fewer.`
      : null,

  email: (label = 'Email') => (v) =>
    v !== undefined && !EMAIL_RE.test(String(v))
      ? `${label} must be a valid email address.`
      : null,

  emailMaxLen: () => (v) =>
    isString(v) && v.length > 254 ? 'Email address is too long.' : null,

  password: (label = 'Password') => (v) => {
    if (!isString(v)) return null; // let required/string rules catch it
    if (v.length < 8)            return `${label} must be at least 8 characters.`;
    if (v.length > 128)          return `${label} must be 128 characters or fewer.`;
    if (!/[A-Z]/.test(v))        return `${label} must contain at least one uppercase letter.`;
    if (!/[0-9]/.test(v))        return `${label} must contain at least one number.`;
    return null;
  },

  hexColor: (label = 'color') => (v) =>
    v !== undefined && !HEX_COLOR_RE.test(String(v))
      ? `${label} must be a valid hex colour (e.g. #f59e0b).`
      : null,

  oneOf: (label, values) => (v) =>
    v !== undefined && !values.includes(v)
      ? `${label} must be one of: ${values.join(', ')}.`
      : null,

  finite: (label) => (v) =>
    v !== undefined && !Number.isFinite(Number(v))
      ? `${label} must be a number.`
      : null,
};

// ── Predefined schemas ─────────────────────────────────────────────────────

export const rules = {
  signup: {
    name:     [r.required('Name'),     r.string('Name'),     r.minLen('Name', 2),     r.maxLen('Name', 50)],
    email:    [r.required('Email'),    r.email(),            r.emailMaxLen()],
    password: [r.required('Password'), r.password()],
  },

  login: {
    email:    [r.required('Email'),    r.email()],
    password: [r.required('Password'), r.string('Password')],
  },

  updateProfile: {
    name: [r.required('Name'), r.string('Name'), r.minLen('Name', 2), r.maxLen('Name', 50)],
  },

  forgotPassword: {
    email: [r.required('Email'), r.email()],
  },

  verifyOtp: {
    email: [r.required('Email'), r.email()],
    otp:   [r.required('OTP'),   r.string('OTP')],
  },

  resetPassword: {
    email:       [r.required('Email'),        r.email()],
    otp:         [r.required('OTP'),          r.string('OTP')],
    newPassword: [r.required('New password'), r.password('New password')],
  },

  createSubject: {
    name:  [r.required('name'), r.string('name'), r.minLen('name', 1), r.maxLen('name', 100)],
    color: [r.hexColor()],
  },

  updateSubject: {
    name:  [r.string('name'), r.minLen('name', 1), r.maxLen('name', 100)],
    color: [r.hexColor()],
  },

  addTopic: {
    name:       [r.required('name'), r.string('name'), r.minLen('name', 1), r.maxLen('name', 100)],
    difficulty: [r.oneOf('difficulty', ['easy', 'medium', 'hard'])],
  },

  updateTopic: {
    name:       [r.string('name'), r.minLen('name', 1), r.maxLen('name', 100)],
    difficulty: [r.oneOf('difficulty', ['easy', 'medium', 'hard'])],
    status:     [r.oneOf('status',     ['pending', 'done'])],
  },

  generateSchedule: {
    examDate:   [r.required('examDate'),   r.string('examDate')],
    dailyHours: [r.required('dailyHours'), r.finite('dailyHours')],
  },

  aiChat: {
    // message XOR messages — checked at controller level; only basic type guard here
  },
};

// ── Middleware factory ─────────────────────────────────────────────────────

/**
 * validate(schema) — returns Express middleware.
 * schema: { fieldName: [ruleFunc, ...], ... }
 * Runs every rule for every field in order; returns the first error as 400.
 */
export function validate(schema) {
  return function validationMiddleware(req, res, next) {
    const body = req.body ?? {};
    for (const [field, fieldRules] of Object.entries(schema)) {
      for (const rule of fieldRules) {
        const err = rule(body[field], body);
        if (err) return res.status(400).json({ message: err });
      }
    }
    next();
  };
}