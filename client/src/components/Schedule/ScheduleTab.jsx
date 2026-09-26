// client/src/components/Schedule/ScheduleTab.jsx
import { useRef, useEffect } from 'react';
import { Clock, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import Card from '../common/Card';
import { EmptyState, Pill } from '../common/index.jsx';
import { DIFF_CLR, DIFF_LBL } from '../../constants';
import SmartRegenBanner from './SmartRegenBanner';
import ExportPDFButton from './ExportPDFButton';

function DayPill({ day, index, active, onClick }) {
  const d      = new Date(day.date + 'T00:00:00');
  const totalH = day.sessions.reduce((a, s) => a + s.hours, 0);

  return (
    <button
      className="day-pill"
      onClick={() => onClick(index)}
      style={{
        minWidth: 60, padding: '9px 6px',
        background:   active ? 'rgba(147,51,234,0.1)' : 'var(--bg-card)',
        border:       active ? '1px solid #9333ea' : '1px solid var(--border-card)',
        borderRadius: 9, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        color: active ? '#9333ea' : 'var(--text-dimmer)',
        transition: 'all 0.18s ease',
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.03em' }}>
        {d.toLocaleDateString('en', { weekday: 'short' })}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: active ? '#9333ea' : 'var(--text-muted)', lineHeight: 1.1 }}>
        {d.getDate()}
      </div>
      <div style={{ fontSize: 9, color: active ? 'rgba(147,51,234,0.7)' : 'var(--text-dimmest)' }}>
        {d.toLocaleDateString('en', { month: 'short' })}
      </div>
      <div style={{
        fontSize: 10, marginTop: 2, fontWeight: 600,
        color: active ? '#9333ea' : 'var(--text-dimmest)',
      }}>
        {totalH.toFixed(1)}h
      </div>
    </button>
  );
}

export default function ScheduleTab({
  schedule, dayIdx, setDayIdx, onGoSetup,
  behindCount, daysLeft, doneTopics, totalTopics,
  onRegenerate,
  subjects, examDate, dailyHours, stats,
}) {
  if (!schedule.length) {
    return (
      <EmptyState
        emoji="📅"
        msg="No plan generated yet."
        action="Go to Setup → Generate Plan"
        onAction={onGoSetup}
      />
    );
  }

  const _now     = new Date();
  const todayStr = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
  const todayIdx = schedule.findIndex(d => d.date === todayStr);
  const stripRef = useRef(null);

  // Gate ref: tracks whether we've already auto-jumped for the current schedule
  // instance. Reset whenever schedule identity changes (e.g. after a regen)
  // so the jump fires correctly on the new schedule without a stale closure.
  const didAutoJump = useRef(false);

  useEffect(() => {
    didAutoJump.current = false;
  }, [schedule]);

  // Auto-jump to today on initial load and after schedule regen.
  // todayIdx and setDayIdx are listed as deps — no stale closure.
  // The didAutoJump gate ensures this runs at most once per schedule version.
  useEffect(() => {
    if (!didAutoJump.current && todayIdx >= 0) {
      setDayIdx(todayIdx);
      didAutoJump.current = true;
    }
  }, [todayIdx, setDayIdx, schedule]);

  // Scroll the active pill into view whenever dayIdx changes.
  useEffect(() => {
    if (!stripRef.current) return;
    const pills = stripRef.current.querySelectorAll('.day-pill');
    pills[dayIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [dayIdx]);

  const scrollToToday = () => {
    if (todayIdx < 0) return;
    setDayIdx(todayIdx);
  };

  const today = schedule[dayIdx];
  const total = today.sessions.reduce((a, s) => a + s.hours, 0);
  const date  = new Date(today.date + 'T00:00:00');

  const isTodayActive = dayIdx === todayIdx;
  const isFirstDay    = dayIdx === 0;
  const isLastDay     = dayIdx === schedule.length - 1;

  const navBtnBase = {
    background: 'var(--bg-deep)',
    border: '1px solid var(--border-card)',
    borderRadius: 7,
    padding: '7px 11px',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s ease',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <SmartRegenBanner
        behindCount={behindCount}
        daysLeft={daysLeft}
        doneTopics={doneTopics}
        totalTopics={totalTopics}
        onRegenerate={onRegenerate}
      />

      {/* Day strip */}
      <div
        ref={stripRef}
        style={{
          display: 'flex', gap: 6, overflowX: 'auto',
          paddingBottom: 12, marginBottom: 14,
          scrollbarWidth: 'none',
        }}
      >
        {todayIdx !== -1 && (
          <button
            onClick={scrollToToday}
            style={{
              minWidth: 52, padding: '8px 10px', flexShrink: 0, alignSelf: 'center',
              background: isTodayActive ? 'rgba(52,211,153,0.1)' : 'var(--bg-card)',
              border: `1px solid ${isTodayActive ? '#34d399' : 'var(--border-card)'}`,
              borderRadius: 8, cursor: 'pointer',
              color: isTodayActive ? '#34d399' : 'var(--text-dim)',
              fontSize: 11, fontWeight: 600,
              transition: 'all 0.18s ease',
            }}
          >
            Today
          </button>
        )}

        {schedule.map((day, i) => (
          <DayPill key={day.date} day={day} index={i} active={i === dayIdx} onClick={setDayIdx} />
        ))}
      </div>

      {/* Day detail card */}
      <Card>
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', marginBottom: 18, gap: 12,
        }}>
          <div>
            <div style={{
              fontSize: 19, fontWeight: 700, color: 'var(--text-bright)',
              fontFamily: 'Georgia, serif', lineHeight: 1.3,
            }}>
              {date.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dimmer)', marginTop: 4 }}>
              Day {dayIdx + 1} of {schedule.length}
              <span style={{ margin: '0 6px', color: 'var(--border-card)' }}>·</span>
              <span style={{ color: '#9333ea', fontWeight: 600 }}>{total.toFixed(1)}h</span> total
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>
            <button
              onClick={() => setDayIdx(Math.max(0, dayIdx - 1))}
              disabled={isFirstDay}
              style={{
                ...navBtnBase,
                opacity: isFirstDay ? 0.35 : 1,
                cursor: isFirstDay ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setDayIdx(Math.min(schedule.length - 1, dayIdx + 1))}
              disabled={isLastDay}
              style={{
                ...navBtnBase,
                opacity: isLastDay ? 0.35 : 1,
                cursor: isLastDay ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {today.sessions.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 15px',
                background: 'var(--bg-deep)', borderRadius: 9,
                borderLeft: `3px solid ${s.color}`,
                transition: 'background 0.15s ease',
              }}
            >
              <Clock size={13} color="var(--text-dimmest)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {s.topicName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 3 }}>{s.subjectName}</div>
              </div>
              {s.difficulty && (
                <Pill label={DIFF_LBL[s.difficulty]} color={DIFF_CLR[s.difficulty]} />
              )}
              <span style={{
                fontSize: 14, fontWeight: 700, color: '#9333ea',
                minWidth: 32, textAlign: 'right', flexShrink: 0,
              }}>
                {s.hours}h
              </span>
            </div>
          ))}
        </div>

        {/* Tip banner */}
        <div style={{
          marginTop: 16, padding: '11px 15px',
          background: 'rgba(192,132,252,0.06)',
          border: '1px solid rgba(192,132,252,0.15)',
          borderRadius: 9,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Star size={13} color="#c084fc" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: '#c084fc', lineHeight: 1.6 }}>
            Hard topics come first — your brain is sharpest at the start of a session.
            Take a 5–10 min break between each block.
          </div>
        </div>
      </Card>

      <ExportPDFButton
        schedule={schedule}
        subjects={subjects}
        examDate={examDate}
        dailyHours={dailyHours}
        stats={stats}
      />
    </div>
  );
}