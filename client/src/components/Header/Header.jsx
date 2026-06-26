// client/src/components/Header/Header.jsx
import { useState, useEffect, useRef } from 'react';
import { Target, Calendar, CheckCircle2, BarChart2, Brain, LogOut, User, Zap, Settings } from 'lucide-react';
import { TABS }          from '../../constants';
import { useAuth }       from '../../context/AuthContext';
import PomodoroTimer     from '../Schedule/PomodoroTimer';
import ProfileModal      from './ProfileModal';
import SettingsPanel     from './SettingsPanel';

const LogoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <g stroke="#0d1117" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polygon points="32,13 55,24.5 32,36 9,24.5" fill="#0d1117" stroke="#0d1117"/>
      <path d="M19 30 v10 c0 5 13 8 13 8 s13-3 13-8 V30" fill="#0d1117" stroke="none"/>
      <line x1="55" y1="24.5" x2="55" y2="38"/>
      <circle cx="55" cy="41" r="3" fill="#0d1117" stroke="none"/>
    </g>
  </svg>
);

const TAB_ICONS = {
  setup:    <Target       size={14} />,
  schedule: <Calendar     size={14} />,
  progress: <CheckCircle2 size={14} />,
  stats:    <BarChart2    size={14} />,
  ai:       <Brain        size={14} />,
};

// ── Logout confirmation modal ─────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000, padding: 20,
    }}>
      <div style={{
        background: 'var(--modal-bg, #111827)', border: '1px solid var(--border-card, #252d42)',
        borderRadius: 18, padding: '32px 28px',
        width: '100%', maxWidth: 360, textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <LogOut size={22} color="#f87171" />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary, #f1f5f9)', marginBottom: 8 }}>Sign out?</h3>
        <p style={{ fontSize: 13, color: 'var(--text-dim, #64748b)', marginBottom: 28, lineHeight: 1.6 }}>
          Your study data is saved and will be waiting when you come back.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '11px 0',
            background: 'transparent', border: '1px solid var(--border-card, #252d42)',
            borderRadius: 8, color: 'var(--text-muted, #94a3b8)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '11px 0',
            background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 8, color: '#f87171', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

// ── User avatar dropdown ──────────────────────────────────────────────────
function UserMenu({ user, onOpenProfile, onOpenSettings, onLogout }) {
  const [open,    setOpen]    = useState(false);
  const wrapRef               = useRef(null);
  const initial               = (user?.name ?? 'U').charAt(0).toUpperCase();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [open]);

  const menuItem = (icon, label, onClick, danger = false) => (
    <button
      key={label}
      onClick={() => { setOpen(false); onClick(); }}
      style={{
        width: '100%', background: 'transparent', border: 'none',
        padding: '9px 14px', cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8,
        color: danger ? '#f87171' : 'var(--text-muted, #cbd5e1)',
        fontSize: 13, fontWeight: 500,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(248,113,113,0.08)' : 'rgba(129,140,248,0.07)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: danger ? '#f87171' : 'var(--text-dim, #64748b)' }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={user?.name}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: open
            ? 'linear-gradient(135deg,#a5b4fc,#818cf8)'
            : 'linear-gradient(135deg,#818cf8,#6366f1)',
          border: `2px solid ${open ? '#818cf8' : 'transparent'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#fff',
          cursor: 'pointer', flexShrink: 0,
          boxShadow: open ? '0 0 0 3px rgba(129,140,248,0.25)' : 'none',
          transition: 'all 0.2s',
        }}
      >
        {initial}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:   'fixed',
          top:        72,
          right:      20,
          zIndex:     9000,
          width:      220,
          background: 'var(--bg-card, #1c2030)',
          border:     '1px solid var(--border-card, #252d42)',
          borderRadius: 16,
          boxShadow:  '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
          overflow:   'hidden',
        }}>
          {/* User info section */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-mid, #1e293b)',
            background: 'var(--section-bg, rgba(255,255,255,0.02))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,#818cf8,#6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 800, color: '#fff',
              }}>
                {initial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #f1f5f9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim, #475569)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </div>
              </div>
            </div>

            {/* Pro badge */}
            {user?.isPro && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 20, padding: '3px 10px',
                fontSize: 10, fontWeight: 700, color: '#f59e0b',
                marginTop: 10,
              }}>
                <Zap size={10} /> PRO MEMBER
              </div>
            )}
          </div>

          {/* Menu items */}
          <div style={{ padding: '8px' }}>
            {menuItem(<User size={14} />, 'My Profile', onOpenProfile)}
            {menuItem(<Settings size={14} />, 'Settings', onOpenSettings)}
            <div style={{ height: 1, background: 'var(--border-mid, #1e293b)', margin: '6px 0' }} />
            {menuItem(<LogOut size={14} />, 'Sign out', onLogout, true)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Header ───────────────────────────────────────────────────────────
export default function Header({
  tab, setTab, stats, dailyHours,
  // Pomodoro state from App.jsx
  pomoPhase, setPomoPhase,
  pomoFocusLeft, setPomoFocusLeft,
  pomoBreakLeft, setPomoBreakLeft,
  pomoSessions, setPomoSessions,
  currentTopicName,
  // Data for profile modal
  subjects, examDate,
}) {
  const { user, logout }         = useAuth();
  const [showLogout,   setShowLogout]   = useState(false);
  const [showProfile,  setShowProfile]  = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const metrics = [
    { label: 'Days Left', value: stats.daysLeft,                            color: '#f87171' },
    { label: 'Progress',  value: `${stats.pct}%`,                           color: '#34d399' },
    { label: 'Topics',    value: `${stats.doneTopics}/${stats.totalTopics}`, color: '#818cf8' },
    { label: 'Hours',     value: `${stats.totalHours}h`,                    color: '#f59e0b' },
  ];

  return (
    <>
      <div style={{
        background: 'var(--bg-header, #13192a)',
        borderBottom: '1px solid var(--border-mid, #1a2035)',
      }}>
        <div className="sf-header-inner" style={{ maxWidth: 960, margin: '0 auto', padding: '18px 24px 0' }}>

          {/* ── Top row ── */}
          <div className="sf-header-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>

            {/* Logo */}
            <div style={{
              width: 38, height: 38,
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LogoIcon />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #f1f5f9)', fontFamily: 'Georgia, serif', letterSpacing: '-0.01em', lineHeight: 1 }}>
                StudyFlow AI
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim, #475569)', marginTop: 1 }}>Intelligent Study Planner</div>
            </div>

            {/* Right cluster */}
            <div className="sf-header-cluster" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>

              {/* Live metrics */}
              {metrics.map(m => (
                <div key={m.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dimmer, #475569)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                    {m.label}
                  </div>
                </div>
              ))}

              {/* Divider */}
              <div style={{ width: 1, height: 32, background: 'var(--border-mid, #1e293b)', flexShrink: 0 }} />

              {/* ── Pomodoro pill ── */}
              <PomodoroTimer
                phase={pomoPhase}           setPhase={setPomoPhase}
                focusLeft={pomoFocusLeft}   setFocusLeft={setPomoFocusLeft}
                breakLeft={pomoBreakLeft}   setBreakLeft={setPomoBreakLeft}
                sessions={pomoSessions}     setSessions={setPomoSessions}
                currentTopicName={currentTopicName}
              />

              {/* Divider */}
              <div style={{ width: 1, height: 32, background: 'var(--border-mid, #1e293b)', flexShrink: 0 }} />

              {/* ── Avatar dropdown ── */}
              <UserMenu
                user={user}
                onOpenProfile={() => setShowProfile(true)}
                onOpenSettings={() => setShowSettings(true)}
                onLogout={() => setShowLogout(true)}
              />
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div className="sf-tabs" style={{ display: 'flex', gap: 0 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`tab-btn${tab === t.id ? ' active' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 18px',
                  background: 'transparent', border: 'none',
                  borderBottom: '2px solid transparent',
                  color: tab === t.id ? '#f59e0b' : '#475569',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  borderRadius: '8px 8px 0 0',
                }}
              >
                {TAB_ICONS[t.id]}
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Logout confirmation */}
      {showLogout && (
        <LogoutModal
          onConfirm={() => { setShowLogout(false); logout(); }}
          onCancel={() => setShowLogout(false)}
        />
      )}

      {/* Profile modal */}
      {showProfile && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          stats={stats}
          subjects={subjects}
          examDate={examDate}
          dailyHours={dailyHours}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'var(--modal-bg, #111827)',
            border: '1px solid var(--border-mid, #1e293b)',
            borderRadius: 20, width: '100%', maxWidth: 720,
            height: '80vh', maxHeight: 600,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 22px',
              borderBottom: '1px solid var(--border-mid, #1e293b)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8',
                }}>
                  <Settings size={15} />
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>Settings</span>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim, #64748b)', padding: 4, borderRadius: 6,
                  display: 'flex', alignItems: 'center',
                }}
              >
                ✕
              </button>
            </div>
            {/* Panel body */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <SettingsPanel />
            </div>
          </div>
        </div>
      )}
    </>
  );
}