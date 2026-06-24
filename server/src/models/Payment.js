import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  razorpayOrderId: {
    type: String,
    required: true,
  },
  razorpayPaymentId: {
    type: String,
    default: null,
  },
  razorpaySignature: {
    type: String,
    default: null,
  },
  amountPaise: {
    type: Number,
    required: true,
  },
  originalAmountPaise: {
    type: Number,
    required: true,
  },
  couponCode: {
    type: String,
    default: null,
  },
  discountPct: {
    type: Number,
    default: 0,
  },
  planType: {
    type:    String,
    enum:    ['monthly', 'yearly', 'lifetime'],
    default: 'lifetime',
  },
  status: {
    type: String,
    enum: ['created', 'paid', 'failed'],
    default: 'created',
  },
}, { timestamps: true });

export default mongoose.model('Payment', paymentSchema);