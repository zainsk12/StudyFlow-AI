import mongoose from 'mongoose';

const TopicSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    status:     { type: String, enum: ['pending', 'done'],         default: 'pending' },
  },
  { _id: true, timestamps: false }
);

const SubjectSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,   // fast per-user lookups
    },
    name:   { type: String, required: true, trim: true },
    color:  { type: String, default: '#f59e0b' },
    topics: { type: [TopicSchema], default: [] },
  },
  { timestamps: true }
);

const Subject = mongoose.models.Subject || mongoose.model('Subject', SubjectSchema);
export default Subject;