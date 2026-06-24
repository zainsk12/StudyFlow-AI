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

const StudyPlanSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    examDate:      { type: String, required: true },
    dailyHours:    { type: Number, required: true, min: 0.5, max: 24 },
    schedule:      { type: [DaySchema], default: [] },

    // ── Full planner state fields (for server-side persistence) ──────────────
    subjects:      { type: mongoose.Schema.Types.Mixed, default: [] },
    dayIdx:        { type: Number, default: 0 },
    overflowCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const StudyPlan = mongoose.models.StudyPlan || mongoose.model('StudyPlan', StudyPlanSchema);
export default StudyPlan;