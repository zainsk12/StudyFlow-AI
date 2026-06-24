import express from "express";
import {
  signup,
  login,
  logout,
  logoutAll,
  getMe,
  updateProfile,
  changePassword,
  sendPwdChangeOtp,
  forgotPassword,
  verifyOtp,
  resetPassword,
  sendCancelOtp,
} from "../controllers/auth.controller.js";
import { protect }              from "../middleware/auth.middleware.js";
import { validate, rules }      from "../middleware/validate.js";
import {
  authLimiter,
  otpLimiter,
  forgotPasswordLimiter,
} from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/signup",          authLimiter,           validate(rules.signup),          signup);
router.post("/login",           authLimiter,           validate(rules.login),           login);
router.post("/logout",          protect,                                                logout);
router.post("/logout-all",      protect,                                                logoutAll);
router.get( "/me",              protect,                                                getMe);

router.patch("/profile",        protect,               validate(rules.updateProfile),   updateProfile);

// FIX (Bug 5): OTP-gated password change
router.post("/send-pwd-otp",    protect,               otpLimiter,                      sendPwdChangeOtp);
router.patch("/change-password", protect,               otpLimiter,                      changePassword);

router.post("/forgot-password", forgotPasswordLimiter, validate(rules.forgotPassword),  forgotPassword);
router.post("/verify-otp",      otpLimiter,            validate(rules.verifyOtp),       verifyOtp);
router.post("/reset-password",  authLimiter,           validate(rules.resetPassword),   resetPassword);

router.post("/send-cancel-otp", protect,               otpLimiter,                      sendCancelOtp);

export default router;