import { useState } from 'react';
import { GraduationCap, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ── Screens: 'login' | 'forgot_email' | 'forgot_otp' | 'forgot_reset' | 'forgot_done'
export default function LoginPage({ onSwitch }) {
  const { login } = useAuth();

  // ── Login state ──────────────────────────────────────────────────────────
  const [form,      setForm]      = useState({ email: '', password: '' });
  const [showPass,  setShowPass]  = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  // ── Forgot-password flow state ───────────────────────────────────────────
  const [screen,       setScreen]       = useState('login');
  const [fpEmail,      setFpEmail]      = useState('');
  const [fpOtp,        setFpOtp]        = useState('');
  const [fpNewPass,    setFpNewPass]    = useState('');
  const [fpConfirm,    setFpConfirm]    = useState('');
  const [fpShowNew,    setFpShowNew]    = useState(false);
  const [fpShowConf,   setFpShowConf]   = useState(false);
  const [fpError,      setFpError]      = useState('');
  const [fpLoading,    setFpLoading]    = useState(false);
  const [fpResendCool, setFpResendCool] = useState(false); // resend cooldown

  // ── Helpers ──────────────────────────────────────────────────────────────
  const resetFp = () => {
    setScreen('login');
    setFpEmail(''); setFpOtp('');
    setFpNewPass(''); setFpConfirm('');
    setFpError(''); setFpLoading(false);
  };

  // ── Fetch helper: separates network failures from server errors ──────────
  // fetch() itself only throws on network-level failures (no connection, DNS,
  // CORS abort). HTTP error status codes (4xx, 5xx) resolve normally.
  // res.json() can throw if the body is not valid JSON (e.g. nginx 502 HTML).
  // We catch both cases and surface a user-friendly distinction.
  const apiFetch = async (url, opts) => {
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      throw new Error('Unable to connect. Check your internet connection and try again.');
    }
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Server returned an unexpected response (HTTP ${res.status}). Please try again.`);
    }
    return { res, data };
  };

  // ── Login submit ─────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setError('');
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const { res, data } = await apiFetch('/api/auth/login', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify(form),
      });
      if (!res.ok) { setError(data.message || 'Login failed. Please check your credentials.'); return; }
      login(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 1: send OTP ─────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    setFpError('');
    if (!fpEmail) { setFpError('Please enter your email address.'); return; }
    setFpLoading(true);
    try {
      const { res, data } = await apiFetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: fpEmail }),
      });
      if (!res.ok) { setFpError(data.message || 'Failed to send code.'); return; }
      setScreen('forgot_otp');
      setFpResendCool(true);
      setTimeout(() => setFpResendCool(false), 60000);
    } catch (err) {
      setFpError(err.message);
    } finally {
      setFpLoading(false);
    }
  };

  // ── Step 2: verify OTP ───────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    setFpError('');
    if (!fpOtp || fpOtp.length !== 6) { setFpError('Please enter the 6-digit code.'); return; }
    setFpLoading(true);
    try {
      const { res, data } = await apiFetch('/api/auth/verify-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: fpEmail, otp: fpOtp }),
      });
      if (!res.ok) { setFpError(data.message || 'Invalid code.'); return; }
      setScreen('forgot_reset');
    } catch (err) {
      setFpError(err.message);
    } finally {
      setFpLoading(false);
    }
  };

  // ── Step 3: reset password ───────────────────────────────────────────────
  const handleResetPassword = async () => {
    setFpError('');
    if (!fpNewPass)                    { setFpError('Please enter a new password.'); return; }
    if (fpNewPass.length < 8)          { setFpError('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(fpNewPass))      { setFpError('Password must contain at least one uppercase letter.'); return; }
    if (!/[0-9]/.test(fpNewPass))      { setFpError('Password must contain at least one number.'); return; }
    if (fpNewPass !== fpConfirm)       { setFpError('Passwords do not match.'); return; }
    setFpLoading(true);
    try {
      const { res, data } = await apiFetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: fpEmail, otp: fpOtp, newPassword: fpNewPass }),
      });
      if (!res.ok) { setFpError(data.message || 'Reset failed.'); return; }
      setScreen('forgot_done');
    } catch (err) {
      setFpError(err.message);
    } finally {
      setFpLoading(false);
    }
  };

  // ── Password strength hint for the reset screen ──────────────────────────
  const getResetPasswordHint = () => {
    const p = fpNewPass;
    if (!p) return null;
    const issues = [];
    if (p.length < 8)        issues.push('8+ characters');
    if (!/[A-Z]/.test(p))    issues.push('1 uppercase letter');
    if (!/[0-9]/.test(p))    issues.push('1 number');
    if (issues.length === 0) return { ok: true,  text: 'Password looks good ✓' };
    return { ok: false, text: `Still needs: ${issues.join(', ')}` };
  };
  const resetHint = getResetPasswordHint();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Logo — always visible */}
        <div style={s.logoRow}>
          <div style={s.logoIcon}><GraduationCap size={24} color="#0d1117" /></div>
          <div>
            <div style={s.logoTitle}>StudyFlow AI</div>
            <div style={s.logoSub}>Intelligent Study Planner</div>
          </div>
        </div>

        {/* ── SCREEN: login ─────────────────────────────────────────────── */}
        {screen === 'login' && (
          <>
            <h2 style={s.heading}>Welcome back</h2>
            <p  style={s.sub}>Sign in to continue your study journey</p>

            {error && <div style={s.errorBox}>{error}</div>}

            <label style={s.label}>Email</label>
            <input
              style={s.input}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />

            <label style={s.label}>Password</label>
            <div style={s.inputWrap}>
              <input
                style={{ ...s.input, marginBottom: 0, paddingRight: 44 }}
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <button style={s.eyeBtn} onClick={() => setShowPass(v => !v)} tabIndex={-1} type="button">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Forgot password link */}
            <div style={{ textAlign: 'right', marginTop: 6, marginBottom: 18 }}>
              <span
                style={{ fontSize: 12, color: '#818cf8', cursor: 'pointer', fontWeight: 500 }}
                onClick={() => { setFpEmail(form.email); setScreen('forgot_email'); setFpError(''); }}
              >
                Forgot password?
              </span>
            </div>

            <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={handleLogin} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <p style={s.switchText}>
              Don't have an account?{' '}
              <span style={s.link} onClick={onSwitch}>Sign up</span>
            </p>
          </>
        )}

        {/* ── SCREEN: forgot_email — Step 1 ─────────────────────────────── */}
        {screen === 'forgot_email' && (
          <>
            <button style={s.backBtn} onClick={resetFp}>
              <ArrowLeft size={14} /> Back to login
            </button>
            <h2 style={s.heading}>Reset password</h2>
            <p style={s.sub}>Enter your account email and we'll send you a 6-digit code.</p>

            {fpError && <div style={s.errorBox}>{fpError}</div>}

            <label style={s.label}>Email address</label>
            <input
              style={s.input}
              type="email"
              placeholder="you@example.com"
              value={fpEmail}
              onChange={e => setFpEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
            />

            <button style={{ ...s.btn, opacity: fpLoading ? 0.7 : 1 }} onClick={handleSendOtp} disabled={fpLoading}>
              {fpLoading ? 'Sending…' : 'Send Reset Code'}
            </button>
          </>
        )}

        {/* ── SCREEN: forgot_otp — Step 2 ───────────────────────────────── */}
        {screen === 'forgot_otp' && (
          <>
            <button style={s.backBtn} onClick={() => { setScreen('forgot_email'); setFpError(''); }}>
              <ArrowLeft size={14} /> Back
            </button>
            <h2 style={s.heading}>Enter reset code</h2>
            <p style={s.sub}>
              A 6-digit code was sent to <strong style={{ color: '#94a3b8' }}>{fpEmail}</strong>. It expires in 10 minutes.
            </p>

            {fpError && <div style={s.errorBox}>{fpError}</div>}

            <label style={s.label}>6-digit code</label>
            <input
              style={{ ...s.input, letterSpacing: '0.25em', fontSize: 22, textAlign: 'center', fontFamily: 'monospace' }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={fpOtp}
              onChange={e => setFpOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
            />

            <button style={{ ...s.btn, opacity: fpLoading ? 0.7 : 1 }} onClick={handleVerifyOtp} disabled={fpLoading}>
              {fpLoading ? 'Verifying…' : 'Verify Code'}
            </button>

            {/* Resend link */}
            <p style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: '#475569' }}>
              Didn't receive it?{' '}
              <span
                style={{ color: fpResendCool ? '#334155' : '#818cf8', cursor: fpResendCool ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                onClick={() => { if (!fpResendCool) { setScreen('forgot_email'); setFpOtp(''); setFpError(''); } }}
              >
                {fpResendCool ? 'Resend available in 60s' : 'Resend code'}
              </span>
            </p>
          </>
        )}

        {/* ── SCREEN: forgot_reset — Step 3 ─────────────────────────────── */}
        {screen === 'forgot_reset' && (
          <>
            <h2 style={s.heading}>Set new password</h2>
            <p style={s.sub}>Choose a strong password for your account.</p>

            {fpError && <div style={s.errorBox}>{fpError}</div>}

            <label style={s.label}>New password</label>
            {/* FIX A: placeholder updated to reflect real server-enforced rules */}
            <div style={s.inputWrap}>
              <input
                style={{ ...s.input, marginBottom: 0, paddingRight: 44 }}
                type={fpShowNew ? 'text' : 'password'}
                placeholder="Min. 8 chars, 1 uppercase, 1 number"
                value={fpNewPass}
                onChange={e => setFpNewPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
              />
              <button style={s.eyeBtn} onClick={() => setFpShowNew(v => !v)} tabIndex={-1} type="button">
                {fpShowNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Inline password strength hint — same UX as SignupPage */}
            {resetHint && (
              <div style={{
                fontSize: 11, marginBottom: 16, paddingLeft: 2, marginTop: 6,
                color: resetHint.ok ? '#34d399' : '#f59e0b',
              }}>
                {resetHint.text}
              </div>
            )}

            <label style={{ ...s.label, marginTop: resetHint ? 0 : 16 }}>Confirm new password</label>
            <div style={s.inputWrap}>
              <input
                style={{ ...s.input, marginBottom: 0, paddingRight: 44 }}
                type={fpShowConf ? 'text' : 'password'}
                placeholder="Repeat password"
                value={fpConfirm}
                onChange={e => setFpConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
              />
              <button style={s.eyeBtn} onClick={() => setFpShowConf(v => !v)} tabIndex={-1} type="button">
                {fpShowConf ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button
              style={{ ...s.btn, marginTop: 24, opacity: fpLoading ? 0.7 : 1 }}
              onClick={handleResetPassword}
              disabled={fpLoading}
            >
              {fpLoading ? 'Saving…' : 'Reset Password'}
            </button>
          </>
        )}

        {/* ── SCREEN: forgot_done — Success ─────────────────────────────── */}
        {screen === 'forgot_done' && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle2 size={28} color="#34d399" />
            </div>
            <h2 style={{ ...s.heading, marginBottom: 8 }}>Password reset!</h2>
            <p style={{ ...s.sub, marginBottom: 28 }}>Your password has been updated. You can now sign in with your new password.</p>
            <button style={s.btn} onClick={resetFp}>Back to Sign In</button>
          </div>
        )}

      </div>
    </div>
  );
}

const s = {
  page:      { minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:      { background: '#1c2030', border: '1px solid #252d42', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420 },
  logoRow:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 },
  logoIcon:  { width: 44, height: 44, background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoTitle: { fontSize: 20, fontWeight: 700, color: '#f1f5f9', fontFamily: 'Georgia, serif' },
  logoSub:   { fontSize: 11, color: '#475569', marginTop: 2 },
  heading:   { fontSize: 24, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 },
  sub:       { fontSize: 14, color: '#64748b', marginBottom: 24 },
  errorBox:  { background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 20 },
  label:     { display: 'block', fontSize: 13, fontWeight: 500, color: '#94a3b8', marginBottom: 6 },
  input:     { width: '100%', background: '#111827', border: '1px solid #252d42', borderRadius: 8, padding: '11px 14px', color: '#e2e8f0', fontSize: 14, marginBottom: 18, display: 'block', boxSizing: 'border-box', outline: 'none' },
  inputWrap: { position: 'relative', marginBottom: 4 },
  eyeBtn:    { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 },
  btn:       { width: '100%', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#0d1117', border: 'none', borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  switchText:{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#64748b' },
  link:      { color: '#f59e0b', cursor: 'pointer', fontWeight: 600 },
  backBtn:   { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, padding: '0 0 20px', marginLeft: -4 },
};