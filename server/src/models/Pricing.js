// server/src/models/Pricing.js
//
// Stores all plan pricing configuration in the database so the admin can
// update prices live without touching .env or redeploying.
//
// Design decisions:
//  - Only ONE document ever exists (upserted by planType).
//  - planType: 'monthly' | 'yearly' | 'lifetime'
//  - pricePaise: canonical price in paise (INR × 100), same unit as Payment.
//  - isEnabled: lets admin hide a plan from the paywall without deleting it.
//  - originalPricePaise: optional "was" price for showing a strikethrough.
//  - sortOrder: controls display order on the paywall (0 = first).
//  - updatedBy: records which admin action last changed the price.

import mongoose from 'mongoose';

const PricingSchema = new mongoose.Schema(
  {
    planType: {
      type:     String,
      required: true,
      unique:   true,
    },
    // Human-readable name (admin-facing). Falls back to label if not set.
    name: {
      type:    String,
      default: '',
    },
    label: {
      type:    String,
      default: '',   // e.g. "Monthly", "Annual", "Lifetime"
    },
    pricePaise: {
      type:     Number,
      required: true,
      min:      0,
    },
    // Optional crossed-out "was" price shown on the paywall
    originalPricePaise: {
      type:    Number,
      default: null,
    },
    isEnabled: {
      type:    Boolean,
      default: true,
    },
    // Badge text shown on the plan card, e.g. "Most Popular", "Best Value"
    badge: {
      type:    String,
      default: '',
    },
    // Short description shown under the price on the paywall
    description: {
      type:    String,
      default: '',
    },
    sortOrder: {
      type:    Number,
      default: 0,
    },
    // Number of days the subscription is valid after purchase.
    // null = lifetime (never expires). 30 = monthly, 365 = yearly.
    // Stored here so admin can change durations without redeploying.
    durationDays: {
      type:    Number,
      default: null,
    },
  },
  { timestamps: true }
);

// Virtual: price in INR (for display)
PricingSchema.virtual('priceINR').get(function () {
  return (this.pricePaise / 100).toFixed(0);
});

PricingSchema.set('toJSON',   { virtuals: true });
PricingSchema.set('toObject', { virtuals: true });

const Pricing = mongoose.models.Pricing || mongoose.model('Pricing', PricingSchema);
export default Pricing;