// server/src/routes/admin.routes.js
import { Router }     from 'express';
import { adminGuard } from '../middleware/admin.middleware.js';
import { adminApiLimiter } from '../middleware/rateLimiter.js';
import {
  getStats,
  getCoupons, createCoupon, updateCoupon, deleteCoupon,
  recalculateCouponCounts, getCouponRedeemers,
  getUsers, grantPro, revokePro, deleteUser,
  getUserPayments, extendSubscription, downgradeUser,
  broadcastEmail,
  getPricing, updatePricing, resetPricingDefaults, revenueByPlan,
  createPricing, deletePricing,
} from '../controllers/admin.controller.js';
import {
  adminListRequests,
  adminApprove,
  adminReject,
} from '../controllers/cancellation.controller.js';

const router = Router();

// Dedicated admin rate limit (task 3.2) runs before the guard so unauthenticated
// secret-guessing is throttled too.
router.use(adminApiLimiter);
router.use(adminGuard);

router.get('/stats', getStats);

router.get   ('/coupons',                    getCoupons);
router.post  ('/coupons',                    createCoupon);
router.post  ('/coupons/recalculate-counts', recalculateCouponCounts);
router.get   ('/coupons/:id/users',          getCouponRedeemers);
router.patch ('/coupons/:id',                updateCoupon);
router.delete('/coupons/:id',                deleteCoupon);

router.get   ('/users',                          getUsers);
router.get   ('/users/:id/payments',             getUserPayments);
router.patch ('/users/:id/grant-pro',            grantPro);
router.patch ('/users/:id/revoke-pro',           revokePro);
router.patch ('/users/:id/extend-subscription',  extendSubscription);
router.patch ('/users/:id/downgrade',            downgradeUser);
router.delete('/users/:id',                      deleteUser);

router.post  ('/broadcast',              broadcastEmail);

router.get   ('/pricing',                   getPricing);
router.post  ('/pricing',                   createPricing);
router.post  ('/pricing/reset-defaults',    resetPricingDefaults);
router.get   ('/pricing/revenue-by-plan',   revenueByPlan);
router.patch ('/pricing/:id',               updatePricing);
router.delete('/pricing/:id',               deletePricing);

// ── Cancellation Requests ─────────────────────────────────────────────────
router.get  ('/cancellations',             adminListRequests);
router.post ('/cancellations/:id/approve', adminApprove);
router.post ('/cancellations/:id/reject',  adminReject);

export default router;