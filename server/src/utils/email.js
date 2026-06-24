import nodemailer from "nodemailer";

// Lazy transporter — created on first use so dotenv is always loaded first.
//
// FIX (Bug 5): The old code called _transporter.verify() asynchronously and
// reset _transporter = null inside the callback if verification failed.
// Because verify() runs in the background, getTransporter() had already
// returned the transporter BEFORE the callback fired — meaning:
//   1. The transporter was used in sendMail() while verify was still running.
//   2. If verify failed, _transporter was nulled AFTER it was already in use,
//      causing the next call to retry, potentially looping indefinitely.
//
// The fix is straightforward: remove the null-reset from the verify callback.
// verify() is purely a diagnostic/logging tool — it does not affect whether
// sendMail() works. nodemailer handles SMTP connection errors inside sendMail()
// itself and throws them as rejections, which our try/catch already handles.
// So: log the verify error for visibility, but DO NOT null out _transporter.
// The transporter stays alive and sendMail() will produce its own clear error
// if the credentials are actually broken.
let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
      throw new Error(
        "EMAIL_USER or EMAIL_PASS is missing from environment variables. " +
          "Check your server/.env file."
      );
    }

    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    // Verify connection once at startup for diagnostic logging only.
    // FIX: Do NOT reset _transporter = null here — that caused a race condition
    // where the transporter was nulled after already being returned and used.
    // sendMail() will throw its own rejection if credentials are wrong.
    _transporter.verify((error) => {
      if (error) {
        console.error("❌ Email transporter verify failed:", error.message);
        console.error("   Check EMAIL_USER / EMAIL_PASS in server/.env");
      } else {
        console.log("✅ Email server is ready");
      }
    });
  }

  return _transporter;
}

// ── Send OTP email ─────────────────────────────────────────
export async function sendOtpEmail(toEmail, otp, type = 'reset') {
  try {
    const transporter = getTransporter();

    const from =
      process.env.EMAIL_FROM ||
      `StudyFlow AI <${process.env.EMAIL_USER}>`;

    const isCancel    = type === 'cancel';
    const isPwdChange = type === 'pwdChange';
    const subject   = isCancel    ? 'Confirm Subscription Cancellation — StudyFlow AI'
                    : isPwdChange ? 'Verify Password Change — StudyFlow AI'
                    : 'Your StudyFlow AI password reset code';
    const heading   = isCancel    ? 'Confirm Cancellation'
                    : isPwdChange ? 'Verify Password Change'
                    : 'Password Reset';
    const bodyText  = isCancel    ? 'Enter the code below to confirm your subscription cancellation. It expires in <strong style="color:#f59e0b">10 minutes</strong>.'
                    : isPwdChange ? 'Enter the code below to verify your password change. It expires in <strong style="color:#f59e0b">10 minutes</strong>.'
                    : 'Enter the code below to reset your password. It expires in <strong style="color:#f59e0b">10 minutes</strong>.'

    await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
      html: `
        <div style="font-family:'Segoe UI',sans-serif;background:#0d1117;padding:40px 20px;min-height:100vh">
          <div style="max-width:420px;margin:0 auto;background:#1c2030;border:1px solid #252d42;border-radius:16px;padding:40px 36px">

            <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px">
              <div style="width:44px;height:44px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px">🎓</div>
              <div>
                <div style="font-size:20px;font-weight:700;color:#f1f5f9">StudyFlow AI</div>
                <div style="font-size:11px;color:#475569">Intelligent Study Planner</div>
              </div>
            </div>

            <h2 style="font-size:22px;font-weight:700;color:#f1f5f9;margin:0 0 8px">${heading}</h2>
            <p style="font-size:14px;color:#64748b;margin:0 0 28px">${bodyText}</p>

            <div style="background:#111827;border:1px solid #252d42;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px">
              <div style="font-size:40px;font-weight:700;letter-spacing:12px;color:#f59e0b;font-family:monospace">${otp}</div>
            </div>

            <p style="font-size:12px;color:#334155;text-align:center;margin:0">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        </div>
      `,
    });

    console.log("✅ OTP email sent successfully");
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    throw error;
  }
}

// ── Send purchase confirmation email ───────────────────────────────────────
export async function sendPurchaseConfirmationEmail(toEmail, name, amountPaise, couponCode) {
  try {
    const transporter = getTransporter();
    const from = process.env.EMAIL_FROM || `StudyFlow AI <${process.env.EMAIL_USER}>`;

    const amountDisplay = amountPaise === 0
      ? 'FREE (coupon applied)'
      : `₹${(amountPaise / 100).toFixed(0)}`;

    await transporter.sendMail({
      from,
      to: toEmail,
      subject: '🎉 Welcome to StudyFlow AI Pro — Lifetime Access Unlocked!',
      text: `Hi ${name}, your lifetime access to StudyFlow AI is now active. Amount paid: ${amountDisplay}.`,
      html: `
        <div style="font-family:'Segoe UI',sans-serif;background:#0d1117;padding:40px 20px;min-height:100vh">
          <div style="max-width:480px;margin:0 auto;background:#1c2030;border:1px solid #252d42;border-radius:16px;padding:40px 36px">

            <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px">
              <div style="width:44px;height:44px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px">🎓</div>
              <div>
                <div style="font-size:20px;font-weight:700;color:#f1f5f9">StudyFlow AI</div>
                <div style="font-size:11px;color:#475569">Intelligent Study Planner</div>
              </div>
            </div>

            <div style="text-align:center;margin-bottom:28px">
              <div style="font-size:48px;margin-bottom:12px">🎉</div>
              <h2 style="font-size:24px;font-weight:700;color:#f1f5f9;margin:0 0 8px">You're now Pro!</h2>
              <p style="font-size:14px;color:#64748b;margin:0">Lifetime access to all StudyFlow AI features is now active on your account.</p>
            </div>

            <div style="background:#111827;border:1px solid #252d42;border-radius:12px;padding:20px;margin-bottom:24px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <span style="font-size:13px;color:#64748b">Plan</span>
                <span style="font-size:13px;font-weight:600;color:#f59e0b">Lifetime Access</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <span style="font-size:13px;color:#64748b">Amount Paid</span>
                <span style="font-size:13px;font-weight:600;color:#34d399">${amountDisplay}</span>
              </div>
              ${couponCode ? `
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:13px;color:#64748b">Coupon Used</span>
                <span style="font-size:12px;font-weight:600;color:#818cf8;background:rgba(129,140,248,0.1);padding:2px 8px;border-radius:4px">${couponCode}</span>
              </div>` : ''}
            </div>

            <div style="background:rgba(52,211,153,0.07);border:1px solid rgba(52,211,153,0.2);border-radius:10px;padding:14px 18px;margin-bottom:24px">
              <div style="font-size:13px;font-weight:600;color:#34d399;margin-bottom:6px">✓ Unlocked Features</div>
              <div style="font-size:12px;color:#64748b;line-height:1.8">
                • AI Study Coach (unlimited conversations)<br/>
                • Import Syllabus from PDF<br/>
                • Smart Schedule Regeneration
              </div>
            </div>

            <p style="font-size:12px;color:#334155;text-align:center;margin:0">
              Thank you for supporting StudyFlow AI. Good luck with your studies! 📚
            </p>
          </div>
        </div>
      `,
    });

    console.log("✅ Purchase confirmation email sent");
  } catch (error) {
    console.error("❌ Failed to send purchase confirmation email:", error);
    throw error;
  }
}