// server/src/controllers/auth.controller.js
import User   from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt    from "jsonwebtoken";
import crypto from "crypto";
import { sendOtpEmail } from "../utils/email.js";
import { invalidateUserCache } from "../middleware/auth.middleware.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pre-computed bcrypt hash used as a constant-time decoy when an account does
// not exist, so login / forgot-password timing doesn't reveal whether an email
// is registered (task 3.4). Computed once at module load.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('sf_dummy_password_for_constant_timing', 10);

function validateSignupInput({ name, email, password }) {
  if (!name || !email || !password) return "All fields are required.";
  if (typeof name !== 'string' || name.trim().length < 2) return "Name must be at least 2 characters.";
  if (name.trim().length > 50) return "Name must be 50 characters or fewer.";
  if (!EMAIL_REGEX.test(email)) return "Please enter a valid email address.";
  if (email.length > 254) return "Email address is too long.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}

function validateLoginInput({ email, password }) {
  if (!email || !password) return "Email and password are required.";
  if (!EMAIL_REGEX.test(email)) return "Please enter a valid email address.";
  return null;
}

const COOKIE_NAME = 'sf_token';
const cookieOptions = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

function signToken(user) {
  return jwt.sign(
    { id: user._id, tv: user.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const err = validateSignupInput({ name, email, password });
    if (err) return res.status(400).json({ message: err });

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) return res.status(400).json({ message: "An account with this email already exists." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name.trim(), email: normalizedEmail, password: hashedPassword });

    const { password: _pw, tokenVersion: _tv, resetOtp: _ro, resetOtpExpiry: _roe, resetVerified: _rv, pwdChangeOtp: _po, pwdChangeOtpExpiry: _poe, ...safeUser } = user.toObject();
    res.status(201).json({ message: "Account created successfully", user: safeUser });
  } catch (error) { next(error); }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const err = validateLoginInput({ email, password });
    if (err) return res.status(400).json({ message: err });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Constant-time decoy: always run a bcrypt comparison (against a dummy hash
    // when the account doesn't exist) so response timing doesn't reveal whether
    // the email is registered (task 3.4). The error message is already uniform.
    const isMatch = await bcrypt.compare(password, user ? user.password : DUMMY_BCRYPT_HASH);
    if (!user || !isMatch) return res.status(400).json({ message: "Invalid credentials." });

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);

    const { password: _pw, tokenVersion: _tv, ...safeUser } = user.toObject();
    res.status(200).json({ message: "Login successful", user: safeUser });
  } catch (error) { next(error); }
};

export const logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });
    invalidateUserCache(req.userId);
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) { next(error); }
};

export const logoutAll = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });
    invalidateUserCache(req.userId);
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.status(200).json({ message: 'All sessions revoked.' });
  } catch (error) { next(error); }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select(
      '-password -tokenVersion -resetOtp -resetOtpExpiry -resetVerified -pwdChangeOtp -pwdChangeOtpExpiry'
    );
    if (!user) return res.status(404).json({ message: "User not found." });
    res.status(200).json({ user });
  } catch (error) { next(error); }
};

// ── PATCH /api/auth/profile ───────────────────────────────────────────────
export const updateProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required.' });
    }
    const trimmed = name.trim();
    if (trimmed.length < 2)  return res.status(400).json({ message: 'Name must be at least 2 characters.' });
    if (trimmed.length > 50) return res.status(400).json({ message: 'Name must be 50 characters or fewer.' });

    const user = await User.findByIdAndUpdate(
      req.userId,
      { name: trimmed },
      { new: true, runValidators: true }
    ).select('-password -tokenVersion');

    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.status(200).json({ message: 'Profile updated successfully.', user });
  } catch (error) { next(error); }
};

// ── POST /api/auth/send-pwd-otp ───────────────────────────────────────────
// FIX (Bug 5): Send OTP to email before allowing password change.
export const sendPwdChangeOtp = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const otp       = crypto.randomInt(100000, 999999).toString();
    const otpHashed = await bcrypt.hash(otp, 10);
    const expiry    = new Date(Date.now() + 10 * 60 * 1000);

    await sendOtpEmail(user.email, otp, 'pwdChange');

    // Use the dedicated password-change OTP fields (task 2.3) so this can't
    // collide with an in-flight forgot-password reset.
    user.pwdChangeOtp       = otpHashed;
    user.pwdChangeOtpExpiry = expiry;
    await user.save();

    res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('sendPwdChangeOtp error:', error);
    res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
  }
};

// ── PATCH /api/auth/change-password ──────────────────────────────────────
// FIX (Bug 5): Now requires OTP verification via resetOtp fields.
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, otp } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Both password fields are required.' });
    if (!otp) return res.status(400).json({ message: 'Verification code is required.' });
    if (newPassword.length < 8)      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (!/[A-Z]/.test(newPassword))  return res.status(400).json({ message: 'Password must contain at least one uppercase letter.' });
    if (!/[0-9]/.test(newPassword))  return res.status(400).json({ message: 'Password must contain at least one number.' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Verify current password
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ message: 'Current password is incorrect.' });

    // Verify OTP against the dedicated password-change fields (task 2.3).
    if (!user.pwdChangeOtp || !user.pwdChangeOtpExpiry)
      return res.status(400).json({ message: 'No verification code found. Please request a new one.' });
    if (new Date() > user.pwdChangeOtpExpiry)
      return res.status(400).json({ message: 'Verification code expired. Please request a new one.' });

    const otpMatch = await bcrypt.compare(String(otp).trim(), user.pwdChangeOtp);
    if (!otpMatch) return res.status(400).json({ message: 'Incorrect verification code.' });

    user.password           = await bcrypt.hash(newPassword, 10);
    user.tokenVersion       = (user.tokenVersion || 0) + 1;
    user.pwdChangeOtp       = null;
    user.pwdChangeOtpExpiry = null;
    await user.save();

    // Evict the auth cache so the bumped tokenVersion is seen immediately and
    // the re-issued cookie below isn't treated as a stale session (task 2.2).
    invalidateUserCache(user._id);

    // Re-issue cookie so user stays logged in on this device
    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) { next(error); }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    const GENERIC = "If that email exists, a reset code has been sent.";

    if (user) {
      const otp       = crypto.randomInt(100000, 999999).toString();
      const otpHashed = await bcrypt.hash(otp, 10);
      user.resetOtp       = otpHashed;
      user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      user.resetVerified  = false;
      await user.save();

      // Fire-and-forget so the email send time/outcome can't leak account
      // existence into the response (task 3.4). The user can re-request if it
      // doesn't arrive.
      sendOtpEmail(normalizedEmail, otp).catch((err) =>
        console.error("forgotPassword email error:", err.message)
      );
    } else {
      // Decoy bcrypt work so the no-account path costs roughly the same as the
      // real one — keeps the response timing uniform regardless of existence.
      await bcrypt.hash(crypto.randomInt(100000, 999999).toString(), 10);
    }

    return res.status(200).json({ message: GENERIC });
  } catch (error) {
    console.error("forgotPassword error:", error);
    res.status(500).json({ message: "Failed to send reset email. Please try again." });
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required." });
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.resetOtp || !user.resetOtpExpiry) return res.status(400).json({ message: "Invalid or expired reset code." });
    if (new Date() > user.resetOtpExpiry) return res.status(400).json({ message: "Reset code has expired. Please request a new one." });

    const isMatch = await bcrypt.compare(String(otp).trim(), user.resetOtp);
    if (!isMatch) return res.status(400).json({ message: "Incorrect reset code. Please try again." });

    user.resetVerified = true;
    await user.save();
    res.status(200).json({ message: "OTP verified. You may now set a new password." });
  } catch (error) { next(error); }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ message: "Email and new password are required." });
    if (!otp) return res.status(400).json({ message: "Verification code is required." });
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });
    if (newPassword.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters." });
    if (!/[A-Z]/.test(newPassword)) return res.status(400).json({ message: "Password must contain at least one uppercase letter." });
    if (!/[0-9]/.test(newPassword)) return res.status(400).json({ message: "Password must contain at least one number." });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.resetVerified || !user.resetOtp) return res.status(400).json({ message: "OTP not verified. Please complete verification first." });
    if (!user.resetOtpExpiry || new Date() > user.resetOtpExpiry) return res.status(400).json({ message: "Reset session expired. Please start over." });

    // Bind the reset to possession of the OTP. The `resetVerified` flag alone is
    // keyed only by email (not a secret), so anyone who knows the email could
    // otherwise complete the reset during the verified window. Requiring the OTP
    // again here ensures only the party who received the emailed code can reset.
    const otpMatch = await bcrypt.compare(String(otp).trim(), user.resetOtp);
    if (!otpMatch) return res.status(400).json({ message: "Incorrect verification code." });

    user.password       = await bcrypt.hash(newPassword, 10);
    user.resetOtp       = null;
    user.resetOtpExpiry = null;
    user.resetVerified  = false;
    user.tokenVersion   = (user.tokenVersion || 0) + 1;
    await user.save();
    invalidateUserCache(user._id);
    res.status(200).json({ message: "Password reset successfully. You can now sign in." });
  } catch (error) { next(error); }
};
