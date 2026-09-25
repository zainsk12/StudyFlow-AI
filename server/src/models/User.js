import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },

  tokenVersion: { type: Number, default: 0 },

  resetOtp:       { type: String,  default: null },
  resetOtpExpiry: { type: Date,    default: null },
  resetVerified:  { type: Boolean, default: false },

  // Dedicated OTP for the authenticated "change password" flow. Kept separate
  // from the forgot-password reset* fields so the two flows cannot overwrite
  // each other's codes when run concurrently (roadmap task 2.3).
  pwdChangeOtp:       { type: String, default: null },
  pwdChangeOtpExpiry: { type: Date,   default: null },
}, { timestamps: true });

export default mongoose.model("User", userSchema);
