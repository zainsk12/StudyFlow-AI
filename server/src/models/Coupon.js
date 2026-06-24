import mongoose from 'mongoose';

const CouponSchema = new mongoose.Schema(
  {
    code: {
      type:      String,
      required:  true,
      unique:    true,
      uppercase: true,
      trim:      true,
    },
    // Discount percentage: 10 = 10% off, 100 = free
    discountPct: {
      type:     Number,
      required: true,
      min:      10,
      max:      100,
    },
    // How many USERS can redeem this coupon in total (null = unlimited)
    maxUses: {
      type:    Number,
      default: null,
    },
    // How many times it has been successfully redeemed
    usedCount: {
      type:    Number,
      default: 0,
    },
    // Optional expiry date (null = never expires)
    expiresAt: {
      type:    Date,
      default: null,
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
    // Note for admin (e.g. "Launch discount for beta testers")
    note: {
      type:    String,
      default: '',
    },
  },
  {
    timestamps: true,
    // ✅ FIX: include virtual fields (isValid) in JSON responses
    // Without this, res.json(coupon) never sends isValid — the admin panel
    // would show "Active" even for a fully-exhausted coupon (usedCount >= maxUses).
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: is this coupon still usable right now?
CouponSchema.virtual('isValid').get(function () {
  if (!this.isActive) return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  if (this.maxUses !== null && this.usedCount >= this.maxUses) return false;
  return true;
});

// Virtual: how many redemptions are left (null = unlimited)
CouponSchema.virtual('remainingUses').get(function () {
  if (this.maxUses === null) return null;
  return Math.max(0, this.maxUses - this.usedCount);
});

const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema);
export default Coupon;