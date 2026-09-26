// client/src/components/Schedule/ScheduleTab.jsx
import { useRef, useEffect, useState, useMemo } from 'react';
import { Clock, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Star, Coffee, CalendarOff, ArrowRightLeft } from 'lucide-react';
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
      title={day.isUnavailable ? 'Unavailable day' : day.isRestDay ? 'Rest day' : undefined}
      style={{
        minWidth: 60, padding: '9px 6px',
        background:   active ? 'rgba(99,102,241,0.1)' : 'var(--bg-card)',
        border:       active ? '1px solid var(--accent)' : '1px solid var(--border-card)',
        borderRadius: 9, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        color: active ? 'var(--accent)' : 'var(--text-dimmer)',
        transition: 'all 0.18s ease',
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.03em' }}>
        {d.toLocaleDateString('en', { weekday: 'short' })}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-muted)', lineHeight: 1.1 }}>
        {d.getDate()}
      </div>
      <div style={{ fontSize: 9, color: active ? 'rgba(99,102,241,0.7)' : 'var(--text-dimmest)' }}>
        {d.toLocaleDateString('en', { month: 'short' })}
      </div>
      <div style={{
        fontSize: 10, marginTop: 2, fontWeight: 600,
        color: active ? 'var(--accent)' : 'var(--text-dimmest)',
      }}>
        {day.isUnavailable ? 'OFF' : day.isRestDay ? 'REST' : `${totalH.toFixed(1)}h`}
      </div>
    </button>
  );
}

export default function ScheduleTab({
  schedule, dayIdx, setDayIdx, onGoSetup,
  behindCount, daysLeft, doneTopics, totalTopics,
  onRegenerate, moveTopicToDate, reorderTopicsOnDay, setDayStatus,
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

  // Only auto-jump once after the schedule becomes available. Manual edits
  // should keep the day the user is working on selected.
  const didAutoJump = useRef(false);

  // Auto-jump to today on initial load.
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

  const today = schedule[dayIdx] ?? schedule[0];
  const [moveTopicId, setMoveTopicId] = useState('');
  const [moveDate, setMoveDate] = useState('');
  const [availabilityDate, setAvailabilityDate] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const topicGroups = useMemo(() => {
    const groups = [];
    const byTopic = new Map();
    today.sessions.forEach((session, index) => {
      const key = session.topicId ?? `session-${index}`;
      if (!byTopic.has(key)) {
        const group = { topicId: session.topicId, topicName: session.topicName, subjectName: session.subjectName, color: session.color, difficulty: session.difficulty, sessions: [] };
        byTopic.set(key, group);
        groups.push(group);
      }
      byTopic.get(key).sessions.push(session);
    });
    return groups;
  }, [today.sessions]);
  const topicGroupKey = topicGroups.map(group => group.topicId).join('|');
  useEffect(() => {
    const topicIds = topicGroupKey ? topicGroupKey.split('|') : [];
    if (!moveTopicId || !topicIds.includes(moveTopicId)) {
      setMoveTopicId(topicIds[0] ?? '');
    }
  }, [moveTopicId, topicGroupKey]);
  useEffect(() => {
    setAvailabilityDate(today.date);
  }, [today.date]);
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
              background: isTodayActive ? 'rgba(45,212,191,0.1)' : 'var(--bg-card)',
              border: `1px solid ${isTodayActive ? 'var(--green)' : 'var(--border-card)'}`,
              borderRadius: 8, cursor: 'pointer',
              color: isTodayActive ? 'var(--green)' : 'var(--text-dim)',
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
        <div className="sf-schedule-heading" style={{
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
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{total.toFixed(1)}h</span> total
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

        {/* Schedule editing controls */}
        <div className="sf-schedule-controls">
          <div className="sf-schedule-control-group">
            <label htmlFor="sf-move-topic">Move this day’s topic</label>
            <select id="sf-move-topic" value={moveTopicId} onChange={event => setMoveTopicId(event.target.value)}>
              {topicGroups.map(group => <option key={group.topicId} value={group.topicId}>{group.topicName}</option>)}
            </select>
            <input aria-label="Move topic to date" type="date" value={moveDate} min={todayStr} max={examDate} onChange={event => setMoveDate(event.target.value)} />
            <button type="button" disabled={!moveTopicId || !moveDate} onClick={() => {
              const result = moveTopicToDate(moveTopicId, today.date, moveDate);
              setEditMessage(result.ok ? 'Topic session moved.' : result.message);
            }}><ArrowRightLeft size={14} /> Move</button>
          </div>
          <div className="sf-schedule-control-group">
            <label htmlFor="sf-day-off">Set a day off</label>
            <input id="sf-day-off" type="date" value={availabilityDate} min={todayStr} max={examDate} onChange={event => setAvailabilityDate(event.target.value)} />
            <button type="button" onClick={() => {
              const result = setDayStatus(availabilityDate, 'isUnavailable');
              setEditMessage(result.ok ? 'Day marked unavailable; its sessions were moved to later days.' : result.message);
            }}><CalendarOff size={14} /> Unavailable</button>
            <button type="button" onClick={() => {
              const result = setDayStatus(availabilityDate, 'isRestDay');
              setEditMessage(result.ok ? 'Rest day set; its sessions were moved to later days.' : result.message);
            }}><Coffee size={14} /> Rest day</button>
            {(today.isUnavailable || today.isRestDay) && availabilityDate === today.date && (
              <button type="button" onClick={() => {
                const result = setDayStatus(availabilityDate, null);
                setEditMessage(result.ok ? 'This day is available for study again.' : result.message);
              }}>Restore day</button>
            )}
          </div>
          {editMessage && <div className="sf-schedule-edit-message" role="status">{editMessage}</div>}
        </div>

        {/* Session list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topicGroups.map((group, i) => (
            <div
              key={group.topicId ?? i}
              className="sf-schedule-session"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 15px',
                background: 'var(--bg-deep)', borderRadius: 9,
                borderLeft: `3px solid ${group.color}`,
                transition: 'background 0.15s ease',
              }}
            >
              <Clock size={13} color="var(--text-dimmest)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {group.topicName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 3 }}>{group.subjectName}</div>
              </div>
              {group.difficulty && (
                <Pill label={DIFF_LBL[group.difficulty]} color={DIFF_CLR[group.difficulty]} />
              )}
              <span style={{
                fontSize: 14, fontWeight: 700, color: 'var(--accent)',
                minWidth: 32, textAlign: 'right', flexShrink: 0,
              }}>
                {group.sessions.reduce((sum, session) => sum + session.hours, 0)}h
              </span>
              <div className="sf-topic-order-controls" aria-label={`Reorder ${group.topicName}`}>
                <button type="button" title="Move topic up" aria-label={`Move ${group.topicName} up`} disabled={i === 0} onClick={() => reorderTopicsOnDay(today.date, group.topicId, -1)}><ChevronUp size={14} /></button>
                <button type="button" title="Move topic down" aria-label={`Move ${group.topicName} down`} disabled={i === topicGroups.length - 1} onClick={() => reorderTopicsOnDay(today.date, group.topicId, 1)}><ChevronDown size={14} /></button>
              </div>
            </div>
          ))}
          {!today.sessions.length && (
            <div className="sf-schedule-empty-day">
              {today.isUnavailable ? 'You marked this day unavailable.' : today.isRestDay ? 'This is a planned rest day.' : 'No topics are scheduled for this day.'}
            </div>
          )}
        </div>

        {/* Tip banner */}
        <div style={{
          marginTop: 16, padding: '11px 15px',
          background: 'rgba(167,139,250,0.06)',
          border: '1px solid rgba(167,139,250,0.15)',
          borderRadius: 9,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Star size={13} color="var(--accent-soft)" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: 'var(--accent-soft)', lineHeight: 1.6 }}>
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
