// server/src/config/pricingDefaults.js
//
// Bootstrap seed used ONLY when the Pricing collection is empty (first deploy).
// These values are written to the DB once; after that the admin panel is the
// sole source of truth. Do NOT use these as runtime fallbacks.

export const PRICING_DEFAULTS = [
  {
    planType:           'monthly',
    name:               'Monthly',
    label:              'Monthly',
    pricePaise:         49900,
    originalPricePaise: null,
    isEnabled:          false,
    badge:              '',
    description:        'Billed every month. Cancel anytime.',
    sortOrder:          0,
    durationDays:       30,
  },
  {
    planType:           'yearly',
    name:               'Yearly',
    label:              'Annual',
    pricePaise:         299900,
    originalPricePaise: 598800,
    isEnabled:          false,
    badge:              'Best Value',
    description:        'Billed once a year. Save 50% vs monthly.',
    sortOrder:          1,
    durationDays:       365,
  },
  {
    planType:           'lifetime',
    name:               'Lifetime',
    label:              'Lifetime',
    pricePaise:         19900,
    originalPricePaise: null,
    isEnabled:          true,
    badge:              'Most Popular',
    description:        'Pay once, use forever. No recurring charges.',
    sortOrder:          2,
    durationDays:       null,
  },
];