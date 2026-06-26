// client/src/components/Setup/PlanFeasibilityModal.jsx

import { useState, useMemo } from 'react';
import {
  AlertTriangle, Clock, CalendarDays, Trash2,
  ChevronDown, ChevronUp, X, CheckCircle2, Zap, RefreshCw,
} from 'lucide-react';
import { DIFF_HRS, DIFF_CLR, DIFF_LBL } from '../../constants';

function localMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function localTodayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
}
function daysUntil(dateStr) {
  return Math.max(1, Math.round(
    (localMidnight(dateStr) - localTodayMidnight()) / 86_400_000
  ));
}
function dateStrFromToday(extraDays) {
  const d = new Date(localTodayMidnight());
  d.setDate(d.getDate() + extraDays);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function fmt(n) { return parseFloat(n.toFixed(1)); }

export default function PlanFeasibilityModal({
  subjects,
  examDate,
  dailyHours,
  overflowCount,       // kept for API compat but we derive a fresh count below
  onSetDailyHours,
  onSetExamDate,
  onRemoveTopic,
  onGenerateAnyway,
  onGenerateNew,
  onClose,
}) {
  const [newHours,  setNewHours]  = useState(dailyHours);
  const [newDate,   setNewDate]   = useState(examDate);
  const [toRemove,  setToRemove]  = useState(new Set());
  const [expanded,  setExpanded]  = useState('hours');
  const [applied,   setApplied]   = useState(null);

  const totalTopics = subjects.reduce((a, s) => a + s.topics.length, 0);

  const { totalHours, daysLeft, availableHours, requiredDailyHours, hoursShortfall } =
    useMemo(() => {
      const tot   = subjects.reduce(
        (a, s) => a + s.topics.reduce((b, t) => b + DIFF_HRS[t.difficulty], 0), 0
      );
      const dl    = daysUntil(examDate);
      const avail = fmt(dl * dailyHours);
      const reqDH = dl > 0 ? fmt(tot / dl) : null;
      return {
        totalHours:         fmt(tot),
        daysLeft:           dl,
        availableHours:     avail,
        requiredDailyHours: reqDH,
        hoursShortfall:     fmt(Math.max(0, tot - avail)),
      };
    }, [subjects, examDate, dailyHours]);

  // FIX: Derive a live overflow count from current settings rather than
  // displaying the stale overflowCount prop (which was set at last generation
  // time and may no longer reflect the current dailyHours / examDate).
  //
  // Formula: hours short ÷ average hours per topic.
  // This gives the same order-of-magnitude accuracy as the scheduler without
  // needing to run the full scheduling algorithm on every render.
  const avgHoursPerTopic = totalTopics > 0 ? totalHours / totalTopics : 1;
  const liveOverflowCount = hoursShortfall > 0
    ? Math.max(1, Math.ceil(hoursShortfall / avgHoursPerTopic))
    : 0;

  const removableCandidates = useMemo(() =>
    subjects
      .flatMap(s => s.topics.map(t => ({ ...t, subjectId: s.id, subjectName: s.name })))
      .sort((a, b) => DIFF_HRS[a.difficulty] - DIFF_HRS[b.difficulty]),
    [subjects]
  );

  const hoursFreed = useMemo(() =>
    [...toRemove].reduce((acc, key) => {
      const [,, diff] = key.split('::');
      return acc + (DIFF_HRS[diff] ?? 0);
    }, 0),
    [toRemove]
  );

  const removalSolvesGap  = hoursFreed >= hoursShortfall;
  const daysNeeded        = dailyHours > 0 ? Math.ceil(totalHours / dailyHours) : null;
  const suggestedDate     = daysNeeded ? dateStrFromToday(daysNeeded) : null;
  const hasChanges        = applied !== null;

  const toggleRemove = (t) => {
    const key = `${t.subjectId}::${t.id}::${t.difficulty}`;
    setToRemove(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const isChecked = (t) => toRemove.has(`${t.subjectId}::${t.id}::${t.difficulty}`);

  const applyHours  = () => { onSetDailyHours(newHours); setApplied('hours'); };
  const applyDate   = () => { onSetExamDate(newDate);    setApplied('date');  };
  const applyRemove = () => {
    toRemove.forEach(key => {
      const [sid, tid] = key.split('::');
      onRemoveTopic(sid, tid);
    });
    setApplied('remove');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        {/* Header */}
        <button onClick={onClose} style={styles.closeBtn}><X size={18} /></button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={styles.iconBox}><AlertTriangle size={22} color="#f59e0b" /></div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
              Not enough time for all topics
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              {/* Use liveOverflowCount (computed from current settings) instead of
                  the stale overflowCount prop so the header always reflects the
                  actual gap given current dailyHours and examDate.              */}
              <span style={{ color: '#f87171', fontWeight: 600 }}>
                ~{liveOverflowCount} topic{liveOverflowCount !== 1 ? 's' : ''}
              </span>{' '}
              won't fit before your exam. Adjust below, then click <strong style={{ color: 'var(--text-bright)' }}>Generate New Plan</strong>.
            </div>
          </div>
        </div>

        {/* Summary bar */}
        <div className="sf-grid-4" style={styles.summaryRow}>
          {[
            { label: 'Days left',     value: `${daysLeft}d`,       color: '#f59e0b' },
            { label: 'Hrs available', value: `${availableHours}h`, color: '#60a5fa' },
            { label: 'Hrs needed',    value: `${totalHours}h`,     color: '#f87171' },
            { label: 'Shortfall',     value: `${hoursShortfall}h`, color: hoursShortfall > 0 ? '#f87171' : '#34d399' },
          ].map(i => (
            <div key={i.label} style={styles.summaryCell}>
              <div style={{ fontSize: 16, fontWeight: 800, color: i.color }}>{i.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 2 }}>{i.label}</div>
            </div>
          ))}
        </div>

        {/* Applied success notice */}
        {applied && (
          <div style={styles.successBanner}>
            <CheckCircle2 size={15} color="#34d399" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: '#34d399' }}>
              {applied === 'hours'  && `Daily hours updated to ${newHours}h/day.`}
              {applied === 'date'   && `Exam date updated to ${newDate}.`}
              {applied === 'remove' && `${toRemove.size} topic${toRemove.size !== 1 ? 's' : ''} removed.`}
              {' '}Click <strong>Generate New Plan</strong> below to apply.
            </span>
          </div>
        )}

        {/* PATH 1: Increase daily hours */}
        <Accordion id="hours" expanded={expanded} setExpanded={setExpanded}
          icon={<Clock size={14} color="#818cf8" />}
          label="Increase daily study hours"
          badge={requiredDailyHours ? `Needs ≥ ${requiredDailyHours}h/day` : undefined}
          badgeColor="#818cf8"
        >
          <p style={styles.hint}>
            Currently <b style={{ color: '#f59e0b' }}>{dailyHours}h/day</b> × {daysLeft} days = {availableHours}h.
            Need at least <b style={{ color: '#34d399' }}>{requiredDailyHours}h/day</b> for all {totalTopics} topics.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <input type="range" min={1} max={12} step={0.5} value={newHours}
              onChange={e => setNewHours(+e.target.value)} style={{ flex: 1 }} />
            <span style={{
              minWidth: 46, textAlign: 'center', fontSize: 20, fontWeight: 800,
              color: newHours >= (requiredDailyHours ?? 0) ? '#34d399' : '#f59e0b',
            }}>{newHours}h</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dimmest)', marginBottom: 10 }}>
            <span>1h</span><span>6h</span><span>12h</span>
          </div>
          {newHours >= (requiredDailyHours ?? 0)
            ? <div style={styles.hintGreen}>✓ {newHours}h/day covers everything with {fmt(newHours * daysLeft - totalHours)}h spare.</div>
            : <div style={styles.hintAmber}>Still {fmt(totalHours - newHours * daysLeft)}h short — slide to at least {requiredDailyHours}h.</div>
          }
          <button onClick={applyHours}
            style={{ ...styles.actionBtn, background: 'linear-gradient(135deg,#818cf8,#6366f1)' }}>
            Apply {newHours}h/day
          </button>
        </Accordion>

        {/* PATH 2: Move exam date */}
        <Accordion id="date" expanded={expanded} setExpanded={setExpanded}
          icon={<CalendarDays size={14} color="#60a5fa" />}
          label="Move your target / exam date"
          badge={daysNeeded ? `Needs ${daysNeeded} days` : undefined}
          badgeColor="#60a5fa"
        >
          <p style={styles.hint}>
            At <b style={{ color: '#f59e0b' }}>{dailyHours}h/day</b> you need{' '}
            <b style={{ color: '#34d399' }}>{daysNeeded} days</b>. Suggested date:{' '}
            <b style={{ color: '#34d399' }}>{suggestedDate}</b> or later.
          </p>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Choose new date</div>
            <input type="date" value={newDate}
              min={dateStrFromToday(daysNeeded ?? 1)}
              onChange={e => setNewDate(e.target.value)}
              style={styles.dateInput} />
          </div>
          {daysUntil(newDate) >= (daysNeeded ?? 0)
            ? <div style={styles.hintGreen}>✓ {daysUntil(newDate)} days is enough at {dailyHours}h/day.</div>
            : <div style={styles.hintAmber}>Still short — need at least {daysNeeded} days from today.</div>
          }
          <button onClick={applyDate}
            style={{ ...styles.actionBtn, background: 'linear-gradient(135deg,#60a5fa,#3b82f6)' }}>
            Apply New Date
          </button>
        </Accordion>

        {/* PATH 3: Remove topics */}
        <Accordion id="remove" expanded={expanded} setExpanded={setExpanded}
          icon={<Trash2 size={14} color="#f87171" />}
          label="Remove lower-priority topics"
          badge={`Free up ${hoursShortfall}h`}
          badgeColor="#f87171"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dimmer)' }}>{toRemove.size} selected · {fmt(hoursFreed)}h freed</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: removalSolvesGap ? '#34d399' : '#f59e0b' }}>
              {removalSolvesGap ? '✓ Gap closed!' : `${fmt(hoursShortfall - hoursFreed)}h still needed`}
            </span>
          </div>
          <div style={{ maxHeight: 190, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {removableCandidates.map(t => {
              const checked = isChecked(t);
              const clr = DIFF_CLR[t.difficulty];
              return (
                <label key={`${t.subjectId}-${t.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: checked ? 'rgba(248,113,113,0.08)' : 'var(--bg-deep)',
                  border: checked ? '1px solid rgba(248,113,113,0.3)' : '1px solid var(--border-mid)',
                  borderRadius: 8, padding: '8px 11px', cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleRemove(t)}
                    style={{ accentColor: '#f87171', width: 14, height: 14, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, color: checked ? 'var(--text-dim)' : 'var(--text-primary)',
                      textDecoration: checked ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dimmest)' }}>{t.subjectName}</div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: clr,
                    background: `${clr}15`, border: `1px solid ${clr}30`,
                    borderRadius: 5, padding: '2px 6px', flexShrink: 0,
                  }}>{DIFF_LBL[t.difficulty]} · {DIFF_HRS[t.difficulty]}h</span>
                </label>
              );
            })}
          </div>
          <button onClick={applyRemove} disabled={toRemove.size === 0}
            style={{
              ...styles.actionBtn,
              background: toRemove.size > 0 ? 'linear-gradient(135deg,#f87171,#ef4444)' : '#1a2235',
              color: toRemove.size > 0 ? '#fff' : 'var(--text-dimmest)',
              cursor: toRemove.size > 0 ? 'pointer' : 'not-allowed',
            }}>
            Remove {toRemove.size > 0 ? `${toRemove.size} Topic${toRemove.size !== 1 ? 's' : ''}` : 'Topics'}
          </button>
        </Accordion>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10, paddingTop: 16, borderTop: '1px solid var(--border-mid)' }}>
          <button onClick={onGenerateNew} style={{
            flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: hasChanges
              ? 'linear-gradient(135deg,#34d399,#10b981)'
              : 'linear-gradient(135deg,#f59e0b,#d97706)',
            border: 'none', borderRadius: 9, padding: '12px 16px',
            color: 'var(--bg-base)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            <RefreshCw size={14} />
            {hasChanges ? 'Generate New Plan' : 'Generate Plan'}
          </button>

          <button onClick={onGenerateAnyway} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            background: 'transparent',
            border: '1px solid var(--border-card)', borderRadius: 9, padding: '10px 12px',
            color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Zap size={13} /> Generate Anyway
            </div>
            {/* Use liveOverflowCount so this reflects current settings */}
            <span style={{ fontSize: 10, color: 'var(--text-dimmest)' }}>(~{liveOverflowCount} topics skipped)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Accordion ────────────────────────────────────────────────────────────

function Accordion({ id, expanded, setExpanded, icon, label, badge, badgeColor, children }) {
  const open = expanded === id;
  return (
    <div style={{
      border: `1px solid ${open ? 'var(--border-card)' : '#1a2235'}`,
      borderRadius: 10, marginBottom: 8, overflow: 'hidden',
      background: open ? '#141924' : 'var(--bg-deep)',
    }}>
      <button onClick={() => setExpanded(open ? null : id)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        background: 'transparent', border: 'none', padding: '11px 14px',
        cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        {badge && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: badgeColor,
            background: `${badgeColor}18`, border: `1px solid ${badgeColor}30`,
            borderRadius: 5, padding: '2px 7px', flexShrink: 0,
          }}>{badge}</span>
        )}
        <span style={{ color: 'var(--text-dimmest)', flexShrink: 0 }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 3000, padding: 20,
  },
  modal: {
    background: 'var(--bg-card)', border: '1px solid var(--border-card)',
    borderRadius: 18, padding: '26px 22px',
    width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    background: 'transparent', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer',
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 },
  summaryCell: {
    background: 'var(--bg-deep)', border: '1px solid var(--border-mid)',
    borderRadius: 9, padding: '9px 10px', textAlign: 'center',
  },
  successBanner: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.22)',
    borderRadius: 8, padding: '10px 13px', marginBottom: 12,
  },
  hint: { fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 12, marginTop: 0 },
  hintGreen: {
    fontSize: 12, color: '#34d399', background: 'rgba(52,211,153,0.07)',
    border: '1px solid rgba(52,211,153,0.18)', borderRadius: 6, padding: '6px 10px', marginBottom: 10,
  },
  hintAmber: {
    fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.07)',
    border: '1px solid rgba(245,158,11,0.18)', borderRadius: 6, padding: '6px 10px', marginBottom: 10,
  },
  actionBtn: {
    width: '100%', border: 'none', borderRadius: 8,
    padding: '10px 16px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  dateInput: {
    width: '100%', background: 'var(--bg-deep)', border: '1px solid var(--border-card)',
    borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box',
  },
};