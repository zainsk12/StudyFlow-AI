import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema(
  {
    subjectId:   String,
    subjectName: String,
    color:       String,
    topicId:     String,
    topicName:   String,
    difficulty:  { type: String, enum: ['easy', 'medium', 'hard'] },
    hours:       Number,
  },
  { _id: false }
);

const DaySchema = new mongoose.Schema(
  {
    date:     { type: String, required: true },   // ISO "YYYY-MM-DD"
    sessions: { type: [SessionSchema], default: [] },
  },
  { _id: false }
);

// Study streak, moved here from client localStorage (Module 1: backend sync
// prep). Kept as a small embedded subdocument rather than a separate
// collection since it is 1:1 with a user's plan and is always read/written
// alongside it.
const StreakSchema = new mongoose.Schema(
  {
    count:    { type: Number, default: 0, min: 0 },
    lastDate: { type: String, default: null }, // ISO "YYYY-MM-DD", or null
  },
  { _id: false }
);

// Sensible 30-days-out default so a bare document (e.g. one created purely to
// hold a migrated streak, before the user has ever generated a plan) still
// satisfies schema validation without lying about real plan data.
function defaultExamDateISO() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

const StudyPlanSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    // NOTE: examDate/dailyHours were previously `required: true`. They now
    // fall back to sane defaults instead so a document can be created for
    // streak-migration purposes alone (e.g. a brand-new user who has a
    // localStorage streak but has never generated a plan yet). Every existing
    // write path (generate/saveFullPlan) still always supplies real values,
    // so this is additive and does not change behaviour for existing users.
    examDate:      { type: String, default: defaultExamDateISO },
    dailyHours:    { type: Number, default: 4, min: 0.5, max: 24 },
    schedule:      { type: [DaySchema], default: [] },

    // ── Full planner state fields (for server-side persistence) ──────────────
    subjects:      { type: mongoose.Schema.Types.Mixed, default: [] },
    dayIdx:        { type: Number, default: 0 },
    overflowCount: { type: Number, default: 0 },

    // ── Study streak (Module 1: moved from localStorage to MongoDB) ─────────
    streak: { type: StreakSchema, default: () => ({ count: 0, lastDate: null }) },

    // ── Sync / migration metadata (prep for future cross-device sync;
    //    synchronization itself is NOT implemented here) ─────────────────────
    // Bumped on every full-plan write. Not currently used for conflict
    // resolution (last-write-wins via `savedAt` is unchanged), but recorded
    // now so a future sync module has a monotonically increasing revision
    // number to compare without needing a data migration at that point.
    version: { type: Number, default: 1 },

    // Explicit last-modified marker, distinct from Mongoose's own
    // `updatedAt` (kept via `timestamps` below). Future sync logic may want
    // to stamp this independently of document-save time (e.g. "when did the
    // *client* last change this"), so it's tracked as its own field rather
    // than reused from `updatedAt`.
    lastModified: { type: Date, default: Date.now },

    // One-time guard so the localStorage → server streak migration can never
    // run more than once for a given user, even if the client retries it.
    migratedStreakFromLocalStorage: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const StudyPlan = mongoose.models.StudyPlan || mongoose.model('StudyPlan', StudyPlanSchema);
export default StudyPlan;