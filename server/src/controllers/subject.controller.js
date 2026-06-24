import Subject from '../models/Subject.js';

// ── Shared constants ───────────────────────────────────────────────────────
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_STATUSES     = ['pending', 'done'];
const HEX_COLOR_RE       = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

// ── Shared validators ──────────────────────────────────────────────────────
function validateName(name, label = 'Name') {
  if (typeof name !== 'string' || name.trim().length === 0)
    return `\`${label}\` is required and must be a non-empty string.`;
  if (name.trim().length > 100)
    return `\`${label}\` must be 100 characters or fewer.`;
  return null;
}

function validateColor(color) {
  if (color !== undefined && !HEX_COLOR_RE.test(color))
    return '`color` must be a valid hex color (e.g. #f59e0b).';
  return null;
}

function validateDifficulty(difficulty) {
  if (difficulty !== undefined && !VALID_DIFFICULTIES.includes(difficulty))
    return `\`difficulty\` must be one of: ${VALID_DIFFICULTIES.join(', ')}.`;
  return null;
}

function validateStatus(status) {
  if (status !== undefined && !VALID_STATUSES.includes(status))
    return `\`status\` must be one of: ${VALID_STATUSES.join(', ')}.`;
  return null;
}

// Validates a topics array supplied on subject create.
// Returns an error string, or null if valid.
function validateTopicsArray(topics) {
  if (!Array.isArray(topics))
    return '`topics` must be an array.';
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    if (!t || typeof t !== 'object') return `topics[${i}] must be an object.`;
    const nameErr = validateName(t.name, `topics[${i}].name`);
    if (nameErr) return nameErr;
    const diffErr = validateDifficulty(t.difficulty);
    if (diffErr) return `topics[${i}]: ${diffErr}`;
  }
  return null;
}

// ── Serializer ─────────────────────────────────────────────────────────────
function serialize(doc) {
  const obj = doc.toObject({ virtuals: false });
  return {
    id:     obj._id.toString(),
    name:   obj.name,
    color:  obj.color,
    topics: (obj.topics ?? []).map(t => ({
      id:         t._id.toString(),
      name:       t.name,
      difficulty: t.difficulty,
      status:     t.status,
    })),
  };
}

/* ── Subjects ──────────────────────────────────────────────────────────── */

export async function getAll(req, res, next) {
  try {
    const subjects = await Subject.find({ userId: req.userId }).sort({ createdAt: 1 });
    res.json(subjects.map(serialize));
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { name, color, topics = [] } = req.body;

    const nameErr  = validateName(name, 'name');
    if (nameErr)  return res.status(400).json({ error: nameErr });

    const colorErr = validateColor(color);
    if (colorErr) return res.status(400).json({ error: colorErr });

    const topicsErr = validateTopicsArray(topics);
    if (topicsErr) return res.status(400).json({ error: topicsErr });

    const subject = await Subject.create({
      userId: req.userId,
      name:   name.trim(),
      color:  color || '#f59e0b',
      topics: topics.map(t => ({
        name:       t.name.trim(),
        difficulty: VALID_DIFFICULTIES.includes(t.difficulty) ? t.difficulty : 'medium',
        status:     'pending',
      })),
    });
    res.status(201).json(serialize(subject));
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { name, color } = req.body;

    if (name !== undefined) {
      const nameErr = validateName(name, 'name');
      if (nameErr) return res.status(400).json({ error: nameErr });
    }

    const colorErr = validateColor(color);
    if (colorErr) return res.status(400).json({ error: colorErr });

    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      {
        ...(name  !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color }),
      },
      { new: true, runValidators: true }
    );
    if (!subject) return res.status(404).json({ error: 'Subject not found.' });
    res.json(serialize(subject));
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const subject = await Subject.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!subject) return res.status(404).json({ error: 'Subject not found.' });
    res.json({ message: 'Subject deleted.' });
  } catch (err) {
    next(err);
  }
}

/* ── Topics ────────────────────────────────────────────────────────────── */

export async function addTopic(req, res, next) {
  try {
    const { name, difficulty = 'medium' } = req.body;

    const nameErr = validateName(name, 'name');
    if (nameErr) return res.status(400).json({ error: nameErr });

    const diffErr = validateDifficulty(difficulty);
    if (diffErr) return res.status(400).json({ error: diffErr });

    const subject = await Subject.findOne({ _id: req.params.id, userId: req.userId });
    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    subject.topics.push({ name: name.trim(), difficulty, status: 'pending' });
    await subject.save();

    const newTopic = subject.topics[subject.topics.length - 1];
    res.status(201).json({
      id:         newTopic._id.toString(),
      name:       newTopic.name,
      difficulty: newTopic.difficulty,
      status:     newTopic.status,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTopic(req, res, next) {
  try {
    const { name, difficulty, status } = req.body;

    if (name !== undefined) {
      const nameErr = validateName(name, 'name');
      if (nameErr) return res.status(400).json({ error: nameErr });
    }

    const diffErr = validateDifficulty(difficulty);
    if (diffErr) return res.status(400).json({ error: diffErr });

    const statErr = validateStatus(status);
    if (statErr) return res.status(400).json({ error: statErr });

    const subject = await Subject.findOne({ _id: req.params.id, userId: req.userId });
    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    const topic = subject.topics.id(req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found.' });

    if (name       !== undefined) topic.name       = name.trim();
    if (difficulty !== undefined) topic.difficulty = difficulty;
    if (status     !== undefined) topic.status     = status;

    await subject.save();
    res.json({
      id:         topic._id.toString(),
      name:       topic.name,
      difficulty: topic.difficulty,
      status:     topic.status,
    });
  } catch (err) {
    next(err);
  }
}

export async function removeTopic(req, res, next) {
  try {
    const subject = await Subject.findOne({ _id: req.params.id, userId: req.userId });
    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    const topic = subject.topics.id(req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found.' });

    topic.deleteOne();
    await subject.save();
    res.json({ message: 'Topic deleted.' });
  } catch (err) {
    next(err);
  }
}