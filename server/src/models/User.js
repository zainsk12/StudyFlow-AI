import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },

  tokenVersion: { type: Number, default: 0 },

  isPro:     { type: Boolean, default: false },
  paidAt:    { type: Date,    default: null  },
  paymentId: { type: String,  default: null  },

  // Subscription plan and expiry — null for free users and lifetime subscribers
  planType:              { type: String, enum: ["monthly", "yearly", "lifetime", null], default: null },
  subscriptionExpiresAt: { type: Date,   default: null },

  // Track AI usage for refund/cancellation decisions
  aiMessageCount: { type: Number, default: 0 },

  resetOtp:       { type: String,  default: null },
  resetOtpExpiry: { type: Date,    default: null },
  resetVerified:  { type: Boolean, default: false },

  cancelOtp:       { type: String, default: null },
  cancelOtpExpiry: { type: Date,   default: null },
}, { timestamps: true });

export default mongoose.model("User", userSchema);