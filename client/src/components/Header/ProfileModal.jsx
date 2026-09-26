// client/src/components/Header/ProfileModal.jsx
// Profile page rendered as a full-screen modal.
// Shows user info, plan stats, Pro status, and lets the user edit their name.
// Settings are now accessible via the avatar dropdown → Settings.

import { useState } from 'react';
import {
  X, User, Mail, Calendar, Shield,
  Edit3, Check, Loader, BookOpen, Target, Clock, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ProfileModal({ onClose, stats, subjects, examDate, dailyHours }) {
  const { user, refreshUser } = useAuth();

  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(user?.name ?? '');
  const [nameSaving,  setNameSaving]  = useState(false);
  const [nameError,   setNameError]   = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length < 2) { setNameError('Name must be at least 2 characters.'); return; }
    if (trimmed.length > 50)            { setNameError('Name must be 50 characters or fewer.'); return; }
    setNameError('');
    setNameSaving(true);
    try {
      const res  = await fetch('/api/auth/profile', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setNameError(data.message || 'Could not save name.'); return; }
      await refreshUser(data.user);
      setEditingName(false);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 2500);
    } catch {
      setNameError('Network error — please try again.');
    } finally {
      setNameSaving(false);
    }
  };

  const joinedDate  = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const initial     = (user?.name ?? 'U').charAt(0).toUpperCase();
  const totalTopics = stats?.totalTopics ?? 0;
  const doneTopics  = stats?.doneTopics  ?? 0;
  const pct         = stats?.pct         ?? 0;
  const daysLeft    = stats?.daysLeft    ?? 0;

  return (
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
        borderRadius: 24, width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-mid, #1e293b)',
          background: 'var(--section-bg, #13192a)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'rgba(192,132,252,0.15)', border: '1px solid rgba(192,132,252,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={16} color="#c084fc" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>My Profile</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim, #64748b)', marginTop: 1 }}>Account & study overview</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            color: 'var(--text-dim, #64748b)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', padding: 6, borderRadius: 8,
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Avatar + name */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '32px 24px 24px',
            background: 'linear-gradient(180deg, var(--section-bg, #13192a) 0%, var(--modal-bg, #111827) 100%)',
            borderBottom: '1px solid var(--border-mid, #1e293b)',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg,#c084fc,#9333ea)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 800, color: '#fff',
              boxShadow: '0 8px 32px rgba(147,51,234,0.4)',
              marginBottom: 16, flexShrink: 0,
            }}>
              {initial}
            </div>

            {editingName ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 280 }}>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  handleSaveName();
                    if (e.key === 'Escape') { setEditingName(false); setNameInput(user?.name ?? ''); }
                  }}
                  style={{
                    flex: 1, background: 'var(--input-bg, #1c2030)', border: '1px solid #c084fc',
                    borderRadius: 8, padding: '8px 12px',
                    color: 'var(--text-primary, #f1f5f9)', fontSize: 15, fontWeight: 600,
                    textAlign: 'center', outline: 'none',
                  }}
                />
                <button onClick={handleSaveName} disabled={nameSaving} style={{
                  background: 'rgba(192,132,252,0.15)', border: '1px solid rgba(192,132,252,0.3)',
                  borderRadius: 8, padding: '8px 10px',
                  color: '#c084fc', cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}>
                  {nameSaving ? <Loader size={14} className="spin" /> : <Check size={14} />}
                </button>
                <button onClick={() => { setEditingName(false); setNameInput(user?.name ?? ''); setNameError(''); }} style={{
                  background: 'transparent', border: '1px solid var(--border-card, #252d42)',
                  borderRadius: 8, padding: '8px 10px',
                  color: 'var(--text-dim, #64748b)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}>
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>{user?.name}</div>
                <button
                  onClick={() => { setEditingName(true); setNameInput(user?.name ?? ''); setNameError(''); }}
                  title="Edit name"
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--text-dimmest, #334155)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', padding: 3,
                  }}
                >
                  <Edit3 size={13} />
                </button>
              </div>
            )}

            {nameError   && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>{nameError}</div>}
            {nameSuccess && <div style={{ fontSize: 12, color: '#34d399', marginTop: 6 }}>✓ Name updated!</div>}
          </div>

          {/* Account info */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-mid, #1e293b)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #475569)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Account Details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: <Mail size={14} />,     label: 'Email',        value: user?.email ?? '—' },
                { icon: <Calendar size={14} />, label: 'Member since', value: joinedDate },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10,
                  background: 'var(--bg-card, #1c2030)', border: '1px solid var(--border-mid, #1e293b)',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc',
                  }}>
                    {row.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim, #475569)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary, #e2e8f0)', fontWeight: 500, marginTop: 1 }}>{row.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Study stats */}
          <div style={{ padding: '20px 24px', borderBottom: subjects?.length > 0 ? '1px solid var(--border-mid, #1e293b)' : 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #475569)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Study Overview
            </div>
            <div className="sf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { icon: <Target size={16} />,     label: 'Days Left',   value: daysLeft,                      color: '#f87171' },
                { icon: <TrendingUp size={16} />, label: 'Completion',  value: `${pct}%`,                     color: '#34d399' },
                { icon: <BookOpen size={16} />,   label: 'Topics Done', value: `${doneTopics}/${totalTopics}`, color: '#c084fc' },
                { icon: <Clock size={16} />,      label: 'Daily Hours', value: `${dailyHours}h/day`,           color: '#9333ea' },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'var(--bg-card, #1c2030)', border: '1px solid var(--border-mid, #1e293b)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ color: s.color }}>{s.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim, #475569)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {totalTopics > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim, #475569)' }}>Overall progress</span>
                  <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--border-mid, #1e293b)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: 'linear-gradient(90deg,#34d399,#10b981)',
                    borderRadius: 3, transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Subjects list */}
          {subjects?.length > 0 && (
            <div style={{ padding: '20px 24px 28px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #475569)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Subjects · {subjects.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {subjects.map(s => {
                  const done   = s.topics.filter(t => t.status === 'done').length;
                  const total  = s.topics.length;
                  const subPct = total ? Math.round((done / total) * 100) : 0;
                  return (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10,
                      background: 'var(--bg-card, #1c2030)', border: '1px solid var(--border-mid, #1e293b)',
                    }}>
                      <div style={{ width: 3, height: 36, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #e2e8f0)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.name}
                        </div>
                        <div style={{ height: 4, background: 'var(--border-mid, #1e293b)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${subPct}%`, background: s.color, borderRadius: 2 }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{subPct}%</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim, #475569)' }}>{done}/{total}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
