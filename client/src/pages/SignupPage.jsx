import { useState } from 'react';
import { GraduationCap, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// FIX 2: Client-side password rules now exactly mirror server/src/controllers/auth.controller.js:
//   validateSignupInput → min 8 chars, max 128, 1 uppercase, 1 number
// Previously the client only checked for 6 chars with no other rules, so a
// password like "hello1" would pass the client, reach the server, and return
// a confusing error that contradicted what the UI told the user.
function validateForm({ name, email, password, confirm }) {
  if (!name || !email || !password)
    return 'Please fill in all fields.';
  if (name.trim().length < 2)
    return 'Name must be at least 2 characters.';
  if (password.length < 8)
    return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password))
    return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password))
    return 'Password must contain at least one number.';
  if (password !== confirm)
    return 'Passwords do not match.';
  return null;
}

// Separates network failures from server/JSON errors — see LoginPage for rationale.
async function apiFetch(url, opts) {
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
}

export default function SignupPage({ onSwitch }) {
  const { login } = useAuth();
  const [form,       setForm]       = useState({ name: '', email: '', password: '', confirm: '' });
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [showPass,   setShowPass]   = useState(false);
  const [showConf,   setShowConf]   = useState(false);

  const handleSubmit = async () => {
    setError('');
    const validationError = validateForm(form);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      const { res, data } = await apiFetch('/api/auth/signup', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ name: form.name.trim(), email: form.email, password: form.password }),
      });
      if (!res.ok) { setError(data.message || 'Signup failed. Please try again.'); return; }
      onSwitch();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Password strength hint — shown beneath the password field
  const getPasswordHint = () => {
    const p = form.password;
    if (!p) return null;
    const issues = [];
    if (p.length < 8)         issues.push('8+ characters');
    if (!/[A-Z]/.test(p))     issues.push('1 uppercase letter');
    if (!/[0-9]/.test(p))     issues.push('1 number');
    if (issues.length === 0)  return { ok: true,  text: 'Password looks good ✓' };
    return { ok: false, text: `Still needs: ${issues.join(', ')}` };
  };
  const hint = getPasswordHint();

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}><GraduationCap size={24} color="#0d1117" /></div>
          <div>
            <div style={styles.logoTitle}>StudyFlow AI</div>
            <div style={styles.logoSub}>Intelligent Study Planner</div>
          </div>
        </div>

        <h2 style={styles.heading}>Create an account</h2>
        <p  style={styles.sub}>Start your AI-powered study journey today</p>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>Full Name</label>
        <input
          style={styles.input} type="text" placeholder="John Doe"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />

        <label style={styles.label}>Email</label>
        <input
          style={styles.input} type="email" placeholder="you@example.com"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
        />

        <label style={styles.label}>Password</label>
        {/* FIX 2: placeholder updated to reflect real rules */}
        <div style={{ position: 'relative', marginBottom: hint ? 6 : 18 }}>
          <input
            style={{ ...styles.input, marginBottom: 0, paddingRight: 42 }}
            type={showPass ? 'text' : 'password'}
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => setShowPass(v => !v)}
            style={styles.eyeBtn}
            tabIndex={-1}
          >
            {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {/* Inline password strength hint */}
        {hint && (
          <div style={{
            fontSize: 11, marginBottom: 18, paddingLeft: 2,
            color: hint.ok ? '#34d399' : '#f59e0b',
          }}>
            {hint.text}
          </div>
        )}

        <label style={styles.label}>Confirm Password</label>
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <input
            style={{ ...styles.input, marginBottom: 0, paddingRight: 42 }}
            type={showConf ? 'text' : 'password'}
            placeholder="Repeat password"
            value={form.confirm}
            onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
          <button
            type="button"
            onClick={() => setShowConf(v => !v)}
            style={styles.eyeBtn}
            tabIndex={-1}
          >
            {showConf ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Creating account…' : 'Create Account'}
        </button>

        <p style={styles.switchText}>
          Already have an account?{' '}
          <span style={styles.link} onClick={onSwitch}>Sign in</span>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page:      { minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:      { background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420 },
  logoRow:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 },
  logoIcon:  { width: 44, height: 44, background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoTitle: { fontSize: 20, fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'Georgia, serif' },
  logoSub:   { fontSize: 11, color: 'var(--text-dimmer)', marginTop: 2 },
  heading:   { fontSize: 24, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 6 },
  sub:       { fontSize: 14, color: 'var(--text-dim)', marginBottom: 28 },
  error:     { background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 20 },
  label:     { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 },
  input:     { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-card)', borderRadius: 8, padding: '11px 14px', color: 'var(--text-primary)', fontSize: 14, marginBottom: 18, display: 'block', boxSizing: 'border-box' },
  btn:       { width: '100%', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#0d1117', border: 'none', borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  switchText:{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text-dim)' },
  link:      { color: '#f59e0b', cursor: 'pointer', fontWeight: 600 },
  eyeBtn:    { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' },
};
