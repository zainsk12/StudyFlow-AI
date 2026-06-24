import { useState, useMemo, useCallback, memo } from 'react';
import {
  CheckCircle2, Circle, TrendingUp, Calendar, BookOpen,
  ChevronDown, ChevronUp, Zap, Trash2, AlertTriangle, RefreshCw
} from 'lucide-react';
import Card from '../common/Card';
import { SecLabel, Pill, ProgressBar } from '../common/index.jsx';
import { DIFF_CLR, DIFF_HRS, DIFF_LBL } from '../../constants';

function playDoneSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* no-op if AudioContext unavailable */ }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getTopicStatus(subjects, topicId) {
  for (const s of subjects) {
    const t = s.topics.find(t => t.id === topicId);
    if (t) return t.status;
  }
  return 'pending';
}

function getDefaultOpenIdx(schedule, subjects, todayStr) {
  const todayIdx = schedule.findIndex(d => d.date === todayStr);
  if (todayIdx !== -1) return todayIdx;
  for (let i = 0; i < schedule.length; i++) {
    const ids = schedule[i].sessions.map(s => s.topicId);
    if (!ids.every(id => getTopicStatus(subjects, id) === 'done')) return i;
  }
  return 0;
}

// ── Unmark Modal ───────────────────────────────────────────────────────────
function UnmarkAllModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1c2030', border: '1px solid #2d3748',
        borderRadius: 14, padding: '28px 28px 24px',
        maxWidth: 380, width: '90%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'rgba(248,113,113,0.1)',
          border: '1px solid rgba(248,113,113,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <AlertTriangle size={22} color="#f87171" />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Unmark All Progress?</div>
        </div>
        <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 1.6, marginBottom: 24 }}>
          This will reset <span style={{ color: '#f87171', fontWeight: 600 }}>all completed topics</span> back
          to pending. Your schedule and subjects remain intact.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '10px 0', borderRadius: 9, cursor: 'pointer',
            background: 'transparent', border: '1px solid #252d42',
            color: '#64748b', fontSize: 13, fontWeight: 600,
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '10px 0', borderRadius: 9, cursor: 'pointer',
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            color: '#f87171', fontSize: 13, fontWeight: 600,
          }}>Yes, Reset All</button>
        </div>
      </div>
    </div>
  );
}

// ── Unscheduled Topics Banner ──────────────────────────────────────────────
function UnscheduledBanner({ count, onRegenerate }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: 'rgba(245,158,11,0.06)',
      border: '1px solid rgba(245,158,11,0.2)',
      borderLeft: '3px solid #f59e0b',
      borderRadius: 10, overflow: 'hidden',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', cursor: 'pointer',
        }}
      >
        <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>
            {count} topic{count > 1 ? 's' : ''} not in your current schedule
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            These topics were added after your plan was generated. Regenerate to include them.
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onRegenerate(); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 7, padding: '6px 12px',
            color: '#f59e0b', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}
        >
          <RefreshCw size={12} /> Regenerate Plan
        </button>
        <div style={{ color: '#475569', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
    </div>
  );
}

// ── Day Card ───────────────────────────────────────────────────────────────
// Wrapped in React.memo so it only re-renders when its own props change.
// Without memo, every topic toggle in any day caused ALL DayCards to re-render.
const DayCard = memo(function DayCard({
  day, dayNumber, subjects, toggleTopic,
  isToday, isPast, expanded,
  onToggleExpand, onDayMarkedDone,
}) {
  const sessions = day.sessions;

  // Deduplicate — same topic can appear in multiple sessions when split by scheduler
  const uniqueSessions = sessions.filter(
    (s, i, arr) => arr.findIndex(x => x.topicId === s.topicId) === i
  );

  const topicIds  = uniqueSessions.map(s => s.topicId);
  const doneCount = topicIds.filter(id => getTopicStatus(subjects, id) === 'done').length;
  const total     = topicIds.length;
  const allDone   = doneCount === total && total > 0;
  const pct       = total ? Math.round((doneCount / total) * 100) : 0;
  const totalHrs  = sessions.reduce((a, s) => a + s.hours, 0);
  const date      = new Date(day.date + 'T00:00:00');
  const dateStr   = date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  const [flashId, setFlashId] = useState(null);

  const handleMarkDay = (e) => {
    e.stopPropagation();
    const markingDone = !allDone;
    uniqueSessions.forEach(s => {
      let resolvedSubjectId = s.subjectId;
      for (const subj of subjects) {
        if (subj.topics.some(t => t.id === s.topicId)) {
          resolvedSubjectId = subj.id;
          break;
        }
      }
      const isDone = getTopicStatus(subjects, s.topicId) === 'done';
      if (markingDone !== isDone) toggleTopic(resolvedSubjectId, s.topicId);
    });
    if (markingDone) onDayMarkedDone(dayNumber);
  };

  const handleTopicClick = (subjectId, topicId) => {
    let resolvedSubjectId = subjectId;
    for (const subj of subjects) {
      if (subj.topics.some(t => t.id === topicId)) {
        resolvedSubjectId = subj.id;
        break;
      }
    }
    const isCurrentlyPending = getTopicStatus(subjects, topicId) !== 'done';
    toggleTopic(resolvedSubjectId, topicId);
    if (isCurrentlyPending) {
      playDoneSound();
      setFlashId(topicId);
      setTimeout(() => setFlashId(null), 500);
    }
    const willComplete = isCurrentlyPending && (doneCount + 1 === total);
    if (willComplete) onDayMarkedDone(dayNumber);
  };

  const borderColor = allDone
    ? '#34d399'
    : isToday
    ? '#f59e0b'
    : isPast && doneCount > 0 && doneCount < total
    ? '#f87171'
    : '#252d42';

  return (
    <div style={{
      background: '#1c2030', border: `1px solid ${borderColor}`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.25s ease',
    }}>
      <div
        onClick={() => onToggleExpand(dayNumber)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
      >
        {/* Day badge */}
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: allDone ? 'rgba(52,211,153,0.12)' : isToday ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${allDone ? 'rgba(52,211,153,0.25)' : isToday ? 'rgba(245,158,11,0.25)' : '#252d42'}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.25s ease',
        }}>
          <div style={{ fontSize: 10, color: '#475569', lineHeight: 1 }}>Day</div>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1, marginTop: 1, color: allDone ? '#34d399' : isToday ? '#f59e0b' : '#94a3b8', transition: 'color 0.25s ease' }}>
            {dayNumber}
          </div>
        </div>

        {/* Date + progress */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{dateStr}</span>
            {isToday && !allDone && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 7px', borderRadius: 4 }}>TODAY</span>
            )}
            {isPast && !allDone && doneCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(248,113,113,0.12)', color: '#f87171', padding: '1px 7px', borderRadius: 4 }}>INCOMPLETE</span>
            )}
            {allDone && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(52,211,153,0.12)', color: '#34d399', padding: '1px 7px', borderRadius: 4 }}>DONE ✓</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, background: '#111827', borderRadius: 4, height: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, width: `${pct}%`,
                background: allDone ? '#34d399' : isToday ? '#f59e0b' : '#818cf8',
                transition: 'width 0.35s ease, background 0.25s ease',
              }} />
            </div>
            <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
              {doneCount}/{total} · {totalHrs.toFixed(1)}h
            </span>
          </div>
        </div>

        {/* Mark done button */}
        <button
          onClick={handleMarkDay}
          style={{
            background: allDone ? 'rgba(248,113,113,0.08)' : 'rgba(52,211,153,0.08)',
            border: `1px solid ${allDone ? 'rgba(248,113,113,0.2)' : 'rgba(52,211,153,0.2)'}`,
            borderRadius: 7, padding: '5px 10px',
            color: allDone ? '#f87171' : '#34d399',
            cursor: 'pointer', fontSize: 11, fontWeight: 600,
            whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.2s ease',
          }}
        >
          {allDone ? 'Unmark' : 'Mark Done'}
        </button>

        <div style={{ color: '#334155', flexShrink: 0 }}>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </div>

      {/* Topic list */}
      {expanded && (
        <div style={{ borderTop: '1px solid #1a2035', padding: '8px 16px 14px', animation: 'fadeSlideIn 0.18s ease' }}>
          <div style={{
            display: 'flex', gap: 16, marginBottom: 10,
            padding: '8px 12px', background: 'rgba(255,255,255,0.02)',
            borderRadius: 8, fontSize: 11, color: '#475569',
          }}>
            <span>📚 {total} topics</span>
            <span>✅ {doneCount} done</span>
            <span>⏳ {total - doneCount} remaining</span>
            <span>🕐 {totalHrs.toFixed(1)}h total</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {uniqueSessions.map((s) => {
              const done = getTopicStatus(subjects, s.topicId) === 'done';
              return (
                <div
                  key={s.topicId}
                  onClick={() => handleTopicClick(s.subjectId, s.topicId)}
                  className="hover-row"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                    background: flashId === s.topicId
                      ? 'rgba(52,211,153,0.15)'
                      : done ? 'rgba(52,211,153,0.05)' : 'rgba(255,255,255,0.01)',
                    border: `1px solid ${done ? 'rgba(52,211,153,0.1)' : 'transparent'}`,
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ flexShrink: 0, transition: 'transform 0.18s ease', transform: done ? 'scale(1.1)' : 'scale(1)' }}>
                    {done ? <CheckCircle2 size={15} color="#34d399" /> : <Circle size={15} color="#334155" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, color: done ? '#475569' : '#cbd5e1',
                      textDecoration: done ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      transition: 'color 0.18s ease',
                    }}>
                      {s.topicName}
                    </div>
                    <div style={{ fontSize: 10, marginTop: 1, color: done ? '#1e293b' : '#334155' }}>
                      {s.subjectName}
                    </div>
                  </div>
                  <Pill label={DIFF_LBL[s.difficulty]} color={DIFF_CLR[s.difficulty]} />
                  <span style={{ fontSize: 11, color: '#334155', minWidth: 28, textAlign: 'right' }}>{s.hours}h</span>
                </div>
              );
            })}
          </div>

          {allDone && (
            <div style={{
              marginTop: 10, padding: '8px 12px',
              background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
              borderRadius: 8, fontSize: 12, color: '#34d399', textAlign: 'center',
            }}>
              🎉 Day {dayNumber} complete! Next day is now open below.
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});

// ── BUG 1 FIX: Timezone-safe local date string ────────────────────────────
function localTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function ProgressTab({ subjects, stats, toggleTopic, schedule, onUnmarkAll, onRegenerate }) {
  const [view,            setView]           = useState(schedule.length > 0 ? 'schedule' : 'subject');
  const [showUnmarkModal, setShowUnmarkModal] = useState(false);
  const todayStr = localTodayStr();

  const [expandedIdx, setExpandedIdx] = useState(
    () => getDefaultOpenIdx(schedule, subjects, todayStr)
  );

  // Memoized: only recomputes when schedule or subjects change
  const scheduledTopicIds = useMemo(() => new Set(
    schedule.flatMap(day => day.sessions.map(s => s.topicId))
  ), [schedule]);

  // Memoized: only recomputes when subjects or scheduledTopicIds change
  const unscheduledTopics = useMemo(() => subjects.flatMap(s =>
    s.topics
      .filter(t => !scheduledTopicIds.has(t.id))
      .map(t => ({ ...t, subjectId: s.id, subjectName: s.name, subjectColor: s.color }))
  ), [subjects, scheduledTopicIds]);

  // useCallback prevents new function references on every render, which would
  // defeat React.memo on DayCard (memo compares props by reference).
  const handleToggleExpand = useCallback((dayNumber) => {
    const idx = dayNumber - 1;
    setExpandedIdx(prev => prev === idx ? null : idx);
  }, []);

  const handleDayMarkedDone = useCallback((dayNumber) => {
    const currentIdx = dayNumber - 1;
    let nextIdx = null;
    for (let i = currentIdx + 1; i < schedule.length; i++) {
      const ids    = schedule[i].sessions.map(s => s.topicId);
      const unique = [...new Set(ids)];
      const allDone = unique.every(id => getTopicStatus(subjects, id) === 'done');
      if (!allDone) { nextIdx = i; break; }
    }
    if (nextIdx !== null) {
      setTimeout(() => setExpandedIdx(nextIdx), 350);
    } else {
      setTimeout(() => setExpandedIdx(null), 350);
    }
  }, [schedule, subjects]);

  const handleUnmarkConfirm = () => {
    setShowUnmarkModal(false);
    onUnmarkAll();
    setExpandedIdx(0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {showUnmarkModal && (
        <UnmarkAllModal
          onConfirm={handleUnmarkConfirm}
          onCancel={() => setShowUnmarkModal(false)}
        />
      )}

      {/* Overall card */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <SecLabel icon={<TrendingUp size={13} />}>Overall Completion</SecLabel>
          {stats.doneTopics > 0 && (
            <button
              onClick={() => setShowUnmarkModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(248,113,113,0.07)',
                border: '1px solid rgba(248,113,113,0.2)',
                color: '#f87171', fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}
            >
              <Trash2 size={11} /> Unmark All
            </button>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
          <span style={{ color: '#64748b' }}>{stats.doneTopics} of {stats.totalTopics} topics done</span>
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>{stats.pct}%</span>
        </div>
        <ProgressBar pct={stats.pct} height={10} />
        <div style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
          {stats.pct === 0    && 'Click any topic below to mark it complete ✓'}
          {stats.pct > 0   && stats.pct < 50  && `Keep going! ${stats.totalTopics - stats.doneTopics} topics remaining.`}
          {stats.pct >= 50 && stats.pct < 100 && `Halfway there! ${stats.totalTopics - stats.doneTopics} topics left.`}
          {stats.pct === 100  && "🎉 All topics complete! You're ready for the exam."}
        </div>
      </Card>

      {/* Unscheduled topics warning — shown in both views */}
      {unscheduledTopics.length > 0 && schedule.length > 0 && (
        <UnscheduledBanner
          count={unscheduledTopics.length}
          onRegenerate={onRegenerate}
        />
      )}

      {/* View toggle */}
      {schedule.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setView('schedule')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: view === 'schedule' ? 'rgba(245,158,11,0.1)' : 'transparent',
              border: `1px solid ${view === 'schedule' ? 'rgba(245,158,11,0.3)' : '#252d42'}`,
              color: view === 'schedule' ? '#f59e0b' : '#475569',
            }}
          >
            <Calendar size={13} /> By Schedule
          </button>
          <button
            onClick={() => setView('subject')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: view === 'subject' ? 'rgba(129,140,248,0.1)' : 'transparent',
              border: `1px solid ${view === 'subject' ? 'rgba(129,140,248,0.3)' : '#252d42'}`,
              color: view === 'subject' ? '#818cf8' : '#475569',
            }}
          >
            <BookOpen size={13} /> By Subject
          </button>
        </div>
      )}

      {/* Schedule view */}
      {view === 'schedule' && schedule.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {schedule.map((day, i) => (
            <DayCard
              key={day.date}
              day={day}
              dayNumber={i + 1}
              subjects={subjects}
              toggleTopic={toggleTopic}
              isToday={day.date === todayStr}
              isPast={day.date < todayStr}
              expanded={expandedIdx === i}
              onToggleExpand={handleToggleExpand}
              onDayMarkedDone={handleDayMarkedDone}
            />
          ))}

          {/* Unscheduled topics section within schedule view */}
          {unscheduledTopics.length > 0 && (
            <div style={{
              background: '#1c2030', border: '1px solid #252d42',
              borderLeft: '3px solid #475569',
              borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #1a2035' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                  📋 Unscheduled Topics ({unscheduledTopics.length})
                </div>
                <div style={{ fontSize: 11, color: '#334155' }}>
                  These topics are not in your current plan. You can mark them manually or regenerate your plan.
                </div>
              </div>
              <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {unscheduledTopics.map((t, i) => {
                  const done = t.status === 'done';
                  return (
                    <div
                      key={i}
                      onClick={() => toggleTopic(t.subjectId, t.id)}
                      className="hover-row"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                        background: done ? 'rgba(52,211,153,0.04)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      {done
                        ? <CheckCircle2 size={15} color="#34d399" style={{ flexShrink: 0 }} />
                        : <Circle       size={15} color="#334155" style={{ flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          color: done ? '#475569' : '#94a3b8',
                          textDecoration: done ? 'line-through' : 'none',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {t.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#334155', marginTop: 1 }}>{t.subjectName}</div>
                      </div>
                      <Pill label={DIFF_LBL[t.difficulty]} color={DIFF_CLR[t.difficulty]} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No schedule */}
      {view === 'schedule' && schedule.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 24px',
          border: '1px dashed #1e293b', borderRadius: 12,
          color: '#334155', fontSize: 13,
        }}>
          <Zap size={28} color="#334155" style={{ margin: '0 auto 12px', display: 'block' }} />
          No schedule generated yet — go to Setup and click Generate Plan to see your day-by-day progress here.
        </div>
      )}

      {/* Subject view */}
      {view === 'subject' && subjects.map(s => {
        const done = s.topics.filter(t => t.status === 'done').length;
        const pct  = s.topics.length ? Math.round((done / s.topics.length) * 100) : 0;
        return (
          <Card key={s.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{s.name}</div>
              <span style={{ fontSize: 12, color: '#475569' }}>{done}/{s.topics.length}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{pct}%</span>
            </div>
            <ProgressBar pct={pct} color={s.color} height={4} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
              {s.topics.map(t => (
                <div
                  key={t.id}
                  className="hover-row"
                  onClick={() => toggleTopic(s.id, t.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
                >
                  {t.status === 'done'
                    ? <CheckCircle2 size={15} color="#34d399" style={{ flexShrink: 0 }} />
                    : <Circle       size={15} color="#334155" style={{ flexShrink: 0 }} />}
                  <span style={{
                    flex: 1, fontSize: 13,
                    color: t.status === 'done' ? '#475569' : '#cbd5e1',
                    textDecoration: t.status === 'done' ? 'line-through' : 'none',
                  }}>
                    {t.name}
                  </span>
                  <Pill label={DIFF_LBL[t.difficulty]} color={DIFF_CLR[t.difficulty]} />
                  <span style={{ fontSize: 11, color: '#334155' }}>{DIFF_HRS[t.difficulty]}h</span>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}