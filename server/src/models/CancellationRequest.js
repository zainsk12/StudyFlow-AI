import mongoose from 'mongoose';

const cancellationRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  reason: {
    type: String,
    default: '',
    maxlength: 1000,
  },
  adminReason: {
    type: String,
    default: '',
    maxlength: 1000,
  },
  // Snapshot of usage at time of request
  usageSnapshot: {
    scheduleGenerated: { type: Boolean, default: false },
    aiMessageCount:    { type: Number,  default: 0 },
    subscriptionStart: { type: Date,    default: null },
    planType:          { type: String,  default: 'lifetime' },
  },
}, { timestamps: true });

export default mongoose.model('CancellationRequest', cancellationRequestSchema);