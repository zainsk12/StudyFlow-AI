// client/src/components/Header/SettingsPanel.jsx
// Self-contained Settings UI rendered inside ProfileModal.

import { useState, useCallback, useEffect } from 'react';
import {
  Sun, Moon, Monitor, Lock, Bell, CreditCard, Shield,
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
        background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8',
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
      background: value ? '#6366f1' : 'var(--border-card)',
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
  fontSize: 13, fontWeight: 600, background: '#6366f1', color: '#fff',
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
              border: theme === o.id ? '1.5px solid #6366f1' : '1px solid var(--border-mid)',
              background: theme === o.id ? 'rgba(99,102,241,0.1)' : 'var(--bg-card)',
              color: theme === o.id ? '#818cf8' : 'var(--text-dim)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {o.icon}
            {o.label}
            {theme === o.id && (
              <Check size={10} style={{ color: '#818cf8' }} />
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
                  background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                  fontSize: 12, color: '#818cf8',
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
                    textAlign: 'center', color: '#818cf8',
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

// ── Section: Subscription ─────────────────────────────────────────────────
function SubscriptionSection() {
  const { user } = useAuth();

  // step: 'idle' | 'sending' | 'verify' | 'submitting' | 'done'
  const [step,      setStep]    = useState('idle');
  const [otpVal,    setOtpVal]  = useState('');
  const [reason,    setReason]  = useState('');
  const [msg,       setMsg]     = useState('');
  const [msgOk,     setMsgOk]   = useState(false);

  // Cancellation request status fetched from server
  const [reqStatus, setReqStatus] = useState(null); // null | { status, adminReason, createdAt }

  // FIX: useEffect with user.isPro as dependency — re-fetches whenever Pro status
  // changes (e.g. after re-subscribing), clearing stale approved/rejected banners.
  useEffect(() => {
    if (!user?.isPro) {
      // User is not Pro — clear any stale request status and reset flow
      setReqStatus(null);
      setStep('idle');
      return;
    }
    let cancelled = false;
    fetch('/api/cancellation/my-status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!cancelled) setReqStatus(d.request ?? null); })
      .catch(() => { if (!cancelled) setReqStatus(null); });
    return () => { cancelled = true; };
  }, [user?.isPro, user?.paidAt]); // re-run when isPro or paidAt changes (catches re-subscribe)

  const handleSendOtp = async () => {
    setStep('sending'); setMsg('');
    try {
      const res  = await fetch('/api/cancellation/send-otp', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) { setMsg(data.message || 'Failed to send code.'); setMsgOk(false); setStep('idle'); return; }
      setStep('verify');
      setMsg('Verification code sent to your email.');
      setMsgOk(true);
    } catch { setMsg('Network error.'); setMsgOk(false); setStep('idle'); }
  };

  const handleSubmitRequest = async () => {
    if (!otpVal || otpVal.length !== 6) { setMsg('Enter the 6-digit code from your email.'); setMsgOk(false); return; }
    setStep('submitting'); setMsg('');
    try {
      const res  = await fetch('/api/cancellation/request', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpVal, reason }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.message || 'Submission failed.'); setMsgOk(false); setStep('verify'); return; }
      setMsg('✓ Request submitted. Awaiting admin review.'); setMsgOk(true);
      setStep('done');
      setReqStatus({ status: 'pending', adminReason: '', createdAt: new Date().toISOString() });
    } catch { setMsg('Network error.'); setMsgOk(false); setStep('submitting'); }
  };

  const paidDate = user?.paidAt
    ? new Date(user.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const statusColors = {
    pending:  { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  color: '#f59e0b' },
    approved: { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.25)',  color: '#34d399' },
    rejected: { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', color: '#f87171' },
  };

  const hasPendingRequest = reqStatus?.status === 'pending';

  return (
    <div>
      <SectionTitle>Subscription & Payments</SectionTitle>
      <Card>
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Plan badge */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderRadius: 10,
            background: user?.isPro ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.06)',
            border: `1px solid ${user?.isPro ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.15)'}`,
          }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 2 }}>Current Plan</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: user?.isPro ? '#f59e0b' : '#818cf8' }}>
                {user?.isPro ? '⚡ Pro' : '🆓 Free'}
              </div>
            </div>
            {user?.isPro && paidDate && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Activated</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{paidDate}</div>
              </div>
            )}
          </div>

          {/* Payment ID */}
          {user?.isPro && user?.paymentId && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--input-bg)', border: '1px solid var(--border-mid)',
              fontSize: 12, color: 'var(--text-dim)',
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3 }}>Payment ID</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{user.paymentId}</div>
            </div>
          )}

          {!user?.isPro && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>
              Upgrade to Pro to unlock unlimited AI coaching, advanced analytics, and more.
            </div>
          )}

          {/* Existing request status banner */}
          {user?.isPro && reqStatus && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: statusColors[reqStatus.status]?.bg,
              border: `1px solid ${statusColors[reqStatus.status]?.border}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: statusColors[reqStatus.status]?.color, marginBottom: 4 }}>
                {reqStatus.status === 'pending'  && '⏳ Cancellation Request Pending'}
                {reqStatus.status === 'approved' && '✓ Cancellation Approved'}
                {reqStatus.status === 'rejected' && '✗ Cancellation Rejected'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                Submitted {new Date(reqStatus.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              {reqStatus.status === 'rejected' && reqStatus.adminReason && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', borderRadius: 7,
                  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)',
                  fontSize: 12, color: '#f87171',
                }}>
                  <strong>Reason:</strong> {reqStatus.adminReason}
                </div>
              )}
            </div>
          )}

          {/* Cancellation request flow (only if Pro and no pending request) */}
          {user?.isPro && !hasPendingRequest && reqStatus?.status !== 'approved' && step !== 'done' && (
            <>
              {step === 'verify' || step === 'submitting' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                    fontSize: 12, color: '#f87171',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <AlertTriangle size={13} /> Enter the 6-digit code sent to {user?.email}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otpVal}
                    onChange={e => setOtpVal(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{
                      ...inputStyle,
                      letterSpacing: '0.3em', fontSize: 18, fontWeight: 700,
                      textAlign: 'center', color: '#f87171',
                    }}
                  />
                  <textarea
                    placeholder="Reason for cancellation (optional)"
                    value={reason}
                    onChange={e => setReason(e.target.value.slice(0, 500))}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setStep('idle'); setOtpVal(''); setMsg(''); }}
                      style={{ ...btnDanger, flex: 1, background: 'transparent', border: '1px solid var(--border-mid)', color: 'var(--text-muted)' }}
                    >
                      Go Back
                    </button>
                    <button
                      onClick={handleSubmitRequest}
                      disabled={step === 'submitting' || otpVal.length !== 6}
                      style={{ ...btnDanger, flex: 1 }}
                    >
                      {step === 'submitting' ? <Loader size={13} className="spin" /> : <AlertTriangle size={13} />}
                      Submit Request
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleSendOtp}
                  disabled={step === 'sending'}
                  style={btnDanger}
                >
                  {step === 'sending' ? <Loader size={13} className="spin" /> : null}
                  {step === 'sending' ? 'Sending code…' : 'Request Cancellation / Refund'}
                </button>
              )}
              {msg && <StatusMsg msg={msg} ok={msgOk} />}
            </>
          )}

          {step === 'done' && msg && <StatusMsg msg={msg} ok={msgOk} />}
        </div>
      </Card>
    </div>
  );
}

// ── Section: Notifications ────────────────────────────────────────────────
function NotificationsSection({ settings, onChange }) {
  return (
    <div>
      <SectionTitle>Notifications</SectionTitle>
      <Card>
        <Row icon={<Bell size={14} />} label="Email Notifications">
          <Toggle
            value={settings.emailNotifs}
            onChange={v => onChange({ ...settings, emailNotifs: v })}
          />
        </Row>
        <Row icon={<Clock size={14} />} label="Study Reminders" last>
          <Toggle
            value={settings.reminders}
            onChange={v => onChange({ ...settings, reminders: v })}
          />
        </Row>
      </Card>
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
                <Clock size={13} color="#818cf8" /> Study Reminder Time
              </label>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#818cf8' }}>{settings.reminderTime}</span>
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
                <BookOpen size={13} color="#818cf8" /> Default Study Hours / Day
              </label>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#818cf8' }}>{settings.defaultHours}h</span>
            </div>
            <input
              type="range" min={1} max={12} step={0.5}
              value={settings.defaultHours}
              onChange={e => onChange({ ...settings, defaultHours: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#6366f1' }}
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
  { id: 'subscription',  label: 'Subscription',   icon: <CreditCard size={14} /> },
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
    background: active === id ? 'rgba(99,102,241,0.1)' : 'transparent',
    color: active === id ? '#818cf8' : 'var(--text-muted)',
    fontSize: 13, fontWeight: active === id ? 600 : 400,
    border: 'none', width: '100%', textAlign: 'left',
    transition: 'all 0.12s',
  });

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar nav */}
      <div style={{
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
        {active === 'subscription'  && <SubscriptionSection />}
        {active === 'notifications' && <NotificationsSection settings={settings} onChange={handleSettingsChange} />}
        {active === 'security'      && <SecuritySection />}
        {active === 'preferences'   && <PreferencesSection settings={settings} onChange={handleSettingsChange} />}
      </div>
    </div>
  );
}