// client/src/components/Header/SettingsPanel.jsx
// Self-contained Settings UI rendered inside ProfileModal.

import { useState, useCallback, useEffect } from 'react';
import {
  Sun, Moon, Monitor, Lock, Bell, Shield,
  Clock, BookOpen, Check, Loader, ChevronRight, LogOut,
  AlertTriangle, Eye, EyeOff,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth }  from '../../context/AuthContext';

// ── Shared sub-components ──────────────────────────────────────────────────
const SectionTitle = ({ children }) => (
  <div style={{
    fontSize: 11, fontWeight: 700, color: 'var(--text-dimmer)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: 10,
  }}>
    {children}
  </div>
);

const Card = ({ children, style }) => (
  <div style={{
    background: 'var(--bg-card)', border: '1px solid var(--border-mid)',
    borderRadius: 12, overflow: 'hidden', ...style,
  }}>
    {children}
  </div>
);

const Row = ({ icon, label, children, last }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: last ? 'none' : '1px solid var(--border-mid)',
    gap: 10,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
    </div>
    {children}
  </div>
);

const Toggle = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    style={{
      width: 40, height: 22, borderRadius: 11,
      background: value ? '#9333ea' : 'var(--border-card)',
      border: 'none', cursor: 'pointer', position: 'relative',
      transition: 'background 0.2s', flexShrink: 0,
    }}
  >
    <span style={{
      position: 'absolute', top: 3,
      left: value ? 21 : 3,
      width: 16, height: 16, borderRadius: '50%',
      background: '#fff', transition: 'left 0.2s',
      display: 'block',
    }} />
  </button>
);

const StatusMsg = ({ msg, ok }) => msg ? (
  <div style={{ fontSize: 12, marginTop: 8, color: ok ? '#34d399' : '#f87171' }}>{msg}</div>
) : null;

const inputStyle = {
  width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-mid)',
  borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)',
  fontSize: 13, outline: 'none',
};

const btnPrimary = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, background: '#9333ea', color: '#fff',
};

const btnDanger = {
  ...btnPrimary,
  background: 'rgba(248,113,113,0.1)', color: '#f87171',
  border: '1px solid rgba(248,113,113,0.2)',
};

// ── Section: Appearance ───────────────────────────────────────────────────
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: 'light',  icon: <Sun  size={14} />, label: 'Light'  },
    { id: 'dark',   icon: <Moon size={14} />, label: 'Dark'   },
    { id: 'system', icon: <Monitor size={14} />, label: 'System' },
  ];
  return (
    <div>
      <SectionTitle>Appearance</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {options.map(o => (
          <button
            key={o.id}
            onClick={() => setTheme(o.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 6, padding: '12px 8px', borderRadius: 10,
              border: theme === o.id ? '1.5px solid #9333ea' : '1px solid var(--border-mid)',
              background: theme === o.id ? 'rgba(147,51,234,0.1)' : 'var(--bg-card)',
              color: theme === o.id ? '#c084fc' : 'var(--text-dim)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {o.icon}
            {o.label}
            {theme === o.id && (
              <Check size={10} style={{ color: '#c084fc' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Section: Account ──────────────────────────────────────────────────────
function AccountSection() {
  const { user, refreshUser, logout } = useAuth();
  const [nameVal, setNameVal] = useState(user?.name ?? '');
  const [emailVal, setEmailVal] = useState(user?.email ?? '');
  const [accMsg,   setAccMsg]  = useState('');
  const [accOk,    setAccOk]   = useState(false);
  const [accSaving, setAccSaving] = useState(false);

  const [curPwd,  setCurPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdMsg,  setPwdMsg]  = useState('');
  const [pwdOk,   setPwdOk]   = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdNeedsRelogin, setPwdNeedsRelogin] = useState(false);
  // FIX (Bug 5): OTP step for password change
  const [pwdOtpStep, setPwdOtpStep] = useState('idle'); // 'idle'|'sending'|'verify'
  const [pwdOtpVal,  setPwdOtpVal]  = useState('');

  const saveAccount = async () => {
    const trimName = nameVal.trim();
    if (!trimName || trimName.length < 2) { setAccMsg('Name must be at least 2 chars.'); setAccOk(false); return; }
    setAccSaving(true); setAccMsg('');
    try {
      const res  = await fetch('/api/auth/profile', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimName }),
      });
      const data = await res.json();
      if (!res.ok) { setAccMsg(data.message || 'Error.'); setAccOk(false); return; }
      await refreshUser(data.user);
      setAccMsg('✓ Profile updated!'); setAccOk(true);
      setTimeout(() => setAccMsg(''), 3000);
    } catch { setAccMsg('Network error.'); setAccOk(false); }
    finally { setAccSaving(false); }
  };

  // FIX (Bug 5): Step 1 — send OTP to email
  const handleSendPwdOtp = async () => {
    if (!curPwd || !newPwd || !confPwd) { setPwdMsg('Fill in all password fields first.'); setPwdOk(false); return; }
    if (newPwd !== confPwd)             { setPwdMsg('New passwords do not match.');        setPwdOk(false); return; }
    if (newPwd.length < 8)             { setPwdMsg('Password must be ≥ 8 chars.');         setPwdOk(false); return; }
    if (!/[A-Z]/.test(newPwd))         { setPwdMsg('Need at least one uppercase letter.'); setPwdOk(false); return; }
    if (!/[0-9]/.test(newPwd))         { setPwdMsg('Need at least one number.');           setPwdOk(false); return; }
    setPwdOtpStep('sending'); setPwdMsg('');
    try {
      const res  = await fetch('/api/auth/send-pwd-otp', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) { setPwdMsg(data.message || 'Failed to send code.'); setPwdOk(false); setPwdOtpStep('idle'); return; }
      setPwdOtpStep('verify');
      setPwdMsg('Verification code sent to your email.'); setPwdOk(true);
    } catch { setPwdMsg('Network error.'); setPwdOk(false); setPwdOtpStep('idle'); }
  };

  // FIX (Bug 5): Step 2 — verify OTP then change password
  const changePassword = async () => {
    if (!pwdOtpVal || pwdOtpVal.length !== 6) { setPwdMsg('Enter the 6-digit code from your email.'); setPwdOk(false); return; }
    setPwdSaving(true); setPwdMsg('');
    try {
      const res  = await fetch('/api/auth/change-password', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd, otp: pwdOtpVal }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdMsg(data.message || 'Error.'); setPwdOk(false); return; }
      setPwdMsg('Password updated successfully'); setPwdOk(true);
      setCurPwd(''); setNewPwd(''); setConfPwd(''); setPwdOtpVal(''); setPwdOtpStep('idle');
      setPwdNeedsRelogin(true);
    } catch { setPwdMsg('Network error.'); setPwdOk(false); }
    finally { setPwdSaving(false); }
  };

  const eyeBtn = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-dim)', position: 'absolute', right: 10, top: '50%',
    transform: 'translateY(-50%)', display: 'flex', alignItems: 'center',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionTitle>Account Management</SectionTitle>
        <Card>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Display Name</div>
              <input style={inputStyle} value={nameVal} onChange={e => setNameVal(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginBottom: 5 }}>Email (read-only)</div>
              <input style={{ ...inputStyle, opacity: 0.5 }} value={emailVal} readOnly />
            </div>
            <button onClick={saveAccount} disabled={accSaving} style={btnPrimary}>
              {accSaving ? <Loader size={14} className="spin" /> : <Check size={14} />}
              Save Changes
            </button>
            <StatusMsg msg={accMsg} ok={accOk} />
          </div>
        </Card>
      </div>

      <div>
        <SectionTitle>Change Password</SectionTitle>
        <Card>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pwdOtpStep !== 'verify' ? (
              <>
                {[
                  { val: curPwd,  set: setCurPwd,  ph: 'Current password' },
                  { val: newPwd,  set: setNewPwd,  ph: 'New password' },
                  { val: confPwd, set: setConfPwd, ph: 'Confirm new password' },
                ].map((f, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      style={{ ...inputStyle, paddingRight: 36 }}
                      value={f.val}
                      onChange={e => f.set(e.target.value)}
                      placeholder={f.ph}
                    />
                    {i === 0 && (
                      <button style={eyeBtn} onClick={() => setShowPwd(p => !p)}>
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={handleSendPwdOtp}
                  disabled={pwdOtpStep === 'sending'}
                  style={btnPrimary}
                >
                  {pwdOtpStep === 'sending' ? <Loader size={14} className="spin" /> : <Lock size={14} />}
                  {pwdOtpStep === 'sending' ? 'Sending code…' : 'Send Verification Code'}
                </button>
              </>
            ) : (
              <>
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(147,51,234,0.06)', border: '1px solid rgba(147,51,234,0.2)',
                  fontSize: 12, color: '#c084fc',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Lock size={13} /> Enter the 6-digit code sent to your email
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={pwdOtpVal}
                  onChange={e => setPwdOtpVal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    ...inputStyle,
                    letterSpacing: '0.3em', fontSize: 18, fontWeight: 700,
                    textAlign: 'center', color: '#c084fc',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setPwdOtpStep('idle'); setPwdOtpVal(''); setPwdMsg(''); }}
                    style={{ ...btnPrimary, flex: 1, background: 'transparent', border: '1px solid var(--border-mid)', color: 'var(--text-muted)' }}
                  >
                    Go Back
                  </button>
                  <button
                    onClick={changePassword}
                    disabled={pwdSaving || pwdOtpVal.length !== 6}
                    style={{ ...btnPrimary, flex: 1 }}
                  >
                    {pwdSaving ? <Loader size={14} className="spin" /> : <Lock size={14} />}
                    Confirm Change
                  </button>
                </div>
              </>
            )}
            <StatusMsg msg={pwdMsg} ok={pwdOk} />
            {pwdNeedsRelogin && (
              <div style={{
                marginTop: 4, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.25)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>✓ Password updated successfully</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>For security, please sign in again with your new password.</div>
                <button onClick={() => logout()} style={{
                  ...btnPrimary, background: 'rgba(52,211,153,0.15)',
                  color: '#34d399', border: '1px solid rgba(52,211,153,0.3)',
                  fontSize: 12, padding: '7px 12px',
                }}>
                  Sign in again
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Section: Security ─────────────────────────────────────────────────────
function SecuritySection() {
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [msg, setMsg] = useState('');

  const logoutAll = async () => {
    setLoggingOut(true);
    try {
      const res = await fetch('/api/auth/logout-all', {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) {
        setMsg('✓ All sessions revoked. Logging out…');
        setTimeout(() => logout(), 1500);
      } else {
        // Fallback: revoke current session only
        setMsg('Session revoked. Logging out…');
        setTimeout(() => logout(), 1500);
      }
    } catch { logout(); }
    finally { setLoggingOut(false); }
  };

  return (
    <div>
      <SectionTitle>Security</SectionTitle>
      <Card>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Logging out of all devices will invalidate all active sessions, including this one.
          </div>
          <button onClick={logoutAll} disabled={loggingOut} style={btnDanger}>
            {loggingOut ? <Loader size={13} className="spin" /> : <LogOut size={13} />}
            Logout All Devices
          </button>
          <StatusMsg msg={msg} ok={msg.startsWith('✓')} />
        </div>
      </Card>
    </div>
  );
}

// ── Section: Preferences ──────────────────────────────────────────────────
function PreferencesSection({ settings, onChange }) {
  return (
    <div>
      <SectionTitle>Preferences</SectionTitle>
      <Card>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={13} color="#c084fc" /> Study Reminder Time
              </label>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#c084fc' }}>{settings.reminderTime}</span>
            </div>
            <input
              type="time"
              value={settings.reminderTime}
              onChange={e => onChange({ ...settings, reminderTime: e.target.value })}
              style={{ ...inputStyle, colorScheme: 'dark' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={13} color="#c084fc" /> Default Study Hours / Day
              </label>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#c084fc' }}>{settings.defaultHours}h</span>
            </div>
            <input
              type="range" min={1} max={12} step={0.5}
              value={settings.defaultHours}
              onChange={e => onChange({ ...settings, defaultHours: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#9333ea' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>1h</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>12h</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Main SettingsPanel ────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'appearance',    label: 'Appearance',     icon: <Sun    size={14} /> },
  { id: 'account',       label: 'Account',        icon: <Lock   size={14} /> },
  { id: 'notifications', label: 'Notifications',  icon: <Bell   size={14} /> },
  { id: 'security',      label: 'Security',        icon: <Shield size={14} /> },
  { id: 'preferences',  label: 'Preferences',    icon: <BookOpen size={14} /> },
];

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('sf_settings') || '{}');
    return {
      emailNotifs:   s.emailNotifs  ?? true,
      reminders:     s.reminders    ?? true,
      reminderTime:  s.reminderTime ?? '08:00',
      defaultHours:  s.defaultHours ?? 4,
    };
  } catch { return { emailNotifs: true, reminders: true, reminderTime: '08:00', defaultHours: 4 }; }
}

export default function SettingsPanel() {
  const [active, setActive] = useState('appearance');
  const [settings, setSettings] = useState(loadSettings);
  const [saved, setSaved] = useState(false);

  const handleSettingsChange = useCallback((next) => {
    setSettings(next);
    localStorage.setItem('sf_settings', JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }, []);

  const navItemStyle = (id) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', cursor: 'pointer', borderRadius: 8,
    background: active === id ? 'rgba(147,51,234,0.1)' : 'transparent',
    color: active === id ? '#c084fc' : 'var(--text-muted)',
    fontSize: 13, fontWeight: active === id ? 600 : 400,
    border: 'none', width: '100%', textAlign: 'left',
    transition: 'all 0.12s',
  });

  return (
    <div className="sf-settings" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar nav */}
      <div className="sf-settings-nav" style={{
        width: 148, flexShrink: 0,
        borderRight: '1px solid var(--border-mid)',
        padding: '12px 8px',
        display: 'flex', flexDirection: 'column', gap: 2,
        overflowY: 'auto',
      }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)} style={navItemStyle(s.id)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {s.icon} {s.label}
            </span>
            {active === s.id && <ChevronRight size={12} />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {saved && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
            borderRadius: 8, padding: '6px 12px', marginBottom: 14,
            fontSize: 12, color: '#34d399', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Check size={12} /> Settings saved
          </div>
        )}
        {active === 'appearance'    && <AppearanceSection />}
        {active === 'account'       && <AccountSection />}
        {active === 'notifications' && <NotificationsSection settings={settings} onChange={handleSettingsChange} />}
        {active === 'security'      && <SecuritySection />}
        {active === 'preferences'   && <PreferencesSection settings={settings} onChange={handleSettingsChange} />}
      </div>
    </div>
  );
}