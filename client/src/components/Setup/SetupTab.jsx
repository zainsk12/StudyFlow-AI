// client/src/components/Setup/SetupTab.jsx
import { useRef, useEffect, useState } from 'react';
import { Plus, Trash2, Clock, Zap, AlertTriangle, Wrench } from 'lucide-react';
import Card from '../common/Card';
import { SecLabel } from '../common/index.jsx';
import { COLORS, DIFF_CLR, DIFF_HRS } from '../../constants';
import SyllabusImport from './SyllabusImport';
import { useAuth } from '../../context/AuthContext';

/* ── Inline-edit input ──────────────────────────────────────────────────── */
function InlineInput({
  value, onChange, placeholder,
  autoFocus = false,
  fontSize = 14, fontWeight = 600, color = 'var(--text-bright)',
}) {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  return (
    <input
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        flex: 1, width: '100%', background: 'transparent',
        border: '1px solid transparent', outline: 'none',
        fontSize, fontWeight, color,
        padding: '3px 6px', borderRadius: 6,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onFocus={e => { e.target.style.background = 'rgba(245,158,11,0.06)'; e.target.style.borderColor = 'rgba(245,158,11,0.4)'; }}
      onBlur={e  => { e.target.style.background = 'transparent';            e.target.style.borderColor = 'transparent'; }}
    />
  );
}

/* ── Difficulty select ──────────────────────────────────────────────────── */
function DiffSelect({ value, onChange }) {
  const clr = DIFF_CLR[value];
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: `${clr}15`, border: `1px solid ${clr}40`,
      borderRadius: 6, padding: '3px 8px', color: clr,
      fontSize: 11, fontWeight: 600, cursor: 'pointer',
    }}>
      <option value="easy">Easy</option>
      <option value="medium">Medium</option>
      <option value="hard">Hard</option>
    </select>
  );
}

/* ── Confirm dialog ─────────────────────────────────────────────────────── */
function ConfirmRegenDialog({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-card)',
        borderRadius: 14, padding: '28px 28px 24px', maxWidth: 400, width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <AlertTriangle size={20} color="#f59e0b" />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)' }}>Overwrite schedule?</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65, marginBottom: 24 }}>
          This will overwrite your current schedule and reset your progress. This cannot be undone.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent', border: '1px solid var(--border-card)',
              borderRadius: 8, padding: '8px 20px',
              color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              border: 'none', borderRadius: 8, padding: '8px 20px',
              color: 'var(--bg-base)', fontWeight: 700, cursor: 'pointer', fontSize: 13,
            }}
          >
            Yes, regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── SetupTab ───────────────────────────────────────────────────────────── */
export default function SetupTab({
  subjects, examDate, dailyHours, stats,
  overflowCount,
  lastAddedSubjectId, lastAddedTopicId,
  setExamDate, setDailyHours,
  addSubject, removeSubject, updateSubject,
  addTopic, removeTopic, updateTopic,
  onImportSubjects, onClearAll,
  onGenerate,
  onOpenFeasibility,
  hasSchedule,
}) {
  const { user } = useAuth();

  const generateCardRef  = useRef(null);
  const prevLastAddedRef = useRef(null);

  // Only auto-scroll to the generate card when subjects were added via PDF import,
  // not on initial render, refresh, or tab switch.
  // SyllabusImport passes { fromPDF: true } as the second argument to onImportSubjects.
  const fromPDFRef = useRef(false);

  // Confirmation dialog state for overwriting an existing schedule
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (
      fromPDFRef.current &&
      lastAddedSubjectId &&
      lastAddedSubjectId !== prevLastAddedRef.current
    ) {
      prevLastAddedRef.current = lastAddedSubjectId;
      fromPDFRef.current = false;
      setTimeout(() => generateCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 150);
    } else if (lastAddedSubjectId !== prevLastAddedRef.current) {
      // Update the ref so we don't fire if the ID later matches a PDF import
      prevLastAddedRef.current = lastAddedSubjectId;
    }
  }, [lastAddedSubjectId]);

  // Wrapper: intercepts the onImportSubjects call to set the PDF flag before
  // the state update triggers the useEffect above.
  const handleImportSubjects = (newSubjects, opts = {}) => {
    if (opts.fromPDF) fromPDFRef.current = true;
    onImportSubjects(newSubjects, opts);
  };

  const canGenerate = subjects.length > 0 && stats.totalTopics > 0;

  const hasOverflow = canGenerate && !stats.feasible;

  const avgHoursPerTopic = stats.totalTopics > 0
    ? stats.totalHours / stats.totalTopics
    : 1;
  const estTopicsOver = hasOverflow
    ? Math.max(1, Math.ceil(stats.hoursShortfall / avgHoursPerTopic))
    : 0;

  const handleGenerateClick = () => {
    if (!canGenerate) return;
    if (hasOverflow) {
      onOpenFeasibility();
      return;
    }
    // If a schedule already exists, ask for confirmation before overwriting
    if (hasSchedule) {
      setShowConfirm(true);
    } else {
      onGenerate();
    }
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    onGenerate();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {showConfirm && (
        <ConfirmRegenDialog
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* ── Exam Config ─────────────────────────────────────────────── */}
      <Card>
        <SecLabel icon={<Clock size={13} />}>Exam Configuration</SecLabel>
        <div className="sf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Exam Date</div>
            <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-deep)', border: '1px solid var(--border-card)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
              Daily Study Hours —{' '}
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{dailyHours}h/day</span>
            </div>
            <input type="range" min={1} max={12} step={0.5} value={dailyHours}
              onChange={e => setDailyHours(+e.target.value)}
              style={{ width: '100%', marginTop: 10 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dimmest)', marginTop: 3 }}>
              <span>1h</span><span>6h</span><span>12h</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Subjects & Topics ───────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <SecLabel icon={<Plus size={13} />}>Subjects &amp; Topics</SecLabel>
          <div className="sf-row-wrap" style={{ display: 'flex', gap: 8 }}>
            <SyllabusImport onImport={handleImportSubjects} />
            <button onClick={addSubject} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 8, padding: '6px 14px', color: '#f59e0b', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>
              <Plus size={13} /> Add Subject
            </button>
            {subjects.length > 0 && (
              <button onClick={onClearAll} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
                borderRadius: 8, padding: '6px 14px', color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}>
                <Trash2 size={13} /> Clear All
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {subjects.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '36px 24px',
              border: '1px dashed var(--border-mid)', borderRadius: 12, color: 'var(--text-dimmest)', fontSize: 13,
            }}>
              No subjects yet — add one manually or import from a PDF syllabus
            </div>
          )}

          {subjects.map(s => {
            const totalH       = s.topics.reduce((a, t) => a + DIFF_HRS[t.difficulty], 0);
            const isNewSubject = s.id === lastAddedSubjectId;
            return (
              <div key={s.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                borderLeft: `3px solid ${s.color}`, borderRadius: 10, padding: '14px 16px',
              }}>
                <div className="parent-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <InlineInput value={s.name} onChange={val => updateSubject(s.id, 'name', val)}
                    placeholder="Subject name…" autoFocus={isNewSubject} fontSize={14} fontWeight={600} color="var(--text-bright)" />
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    {COLORS.map(c => (
                      <button
                        key={c}
                        title={c}
                        onClick={() => updateSubject(s.id, 'color', c)}
                        style={{
                          width: 16, height: 16, borderRadius: '50%',
                          background: c, border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                          outline: s.color === c ? `2px solid ${c}` : '2px solid transparent',
                          outlineOffset: 2,
                          opacity: s.color === c ? 1 : 0.45,
                          transition: 'opacity 0.15s, outline-color 0.15s',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-dimmer)', background: 'var(--bg-deep)', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                    {s.topics.length} topics · {totalH.toFixed(1)}h
                  </span>
                  <button className="rm-btn" onClick={() => removeSubject(s.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-dimmer)', cursor: 'pointer', padding: 3 }}>
                    <Trash2 size={13} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {s.topics.map(t => {
                    const isNewTopic = t.id === lastAddedTopicId;
                    return (
                      <div key={t.id} className="parent-row hover-row"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6 }}>
                        <InlineInput value={t.name} onChange={val => updateTopic(s.id, t.id, 'name', val)}
                          placeholder="Topic name…" autoFocus={isNewTopic} fontSize={13} fontWeight={400} color="var(--text-soft)" />
                        <DiffSelect value={t.difficulty} onChange={val => updateTopic(s.id, t.id, 'difficulty', val)} />
                        <span style={{ fontSize: 11, color: 'var(--text-dimmer)', minWidth: 24, textAlign: 'right' }}>
                          {DIFF_HRS[t.difficulty]}h
                        </span>
                        <button className="rm-btn" onClick={() => removeTopic(s.id, t.id)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-dimmest)', cursor: 'pointer' }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button onClick={() => addTopic(s.id)} style={{
                  marginTop: 8, background: 'transparent', border: '1px dashed var(--border-card)',
                  borderRadius: 6, padding: '6px 12px', color: 'var(--text-dimmer)', cursor: 'pointer', fontSize: 12, width: '100%',
                }}>+ Add Topic</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Overflow warning ─────────────────────────────────────────── */}
      {hasOverflow && (
        <div style={{
          background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)',
          borderLeft: '3px solid #f87171', borderRadius: 10, padding: '14px 18px',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <AlertTriangle size={17} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>
              ~{estTopicsOver} topic{estTopicsOver !== 1 ? 's' : ''} won't fit before your exam
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Your current plan has{' '}
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{stats.daysLeft} days</span> ×{' '}
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{dailyHours}h/day</span> ={' '}
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{stats.availableHours}h</span> available,
              but needs{' '}
              <span style={{ color: '#f87171', fontWeight: 600 }}>{stats.totalHours}h</span> total.
              {stats.requiredDailyHours !== null && (
                <> Increase to at least{' '}
                  <span style={{ color: '#34d399', fontWeight: 700 }}>{stats.requiredDailyHours}h/day</span> to fit everything.</>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Summary + Generate ──────────────────────────────────────── */}
      <div ref={generateCardRef}>
        <Card style={{ background: 'linear-gradient(135deg,var(--bg-card),#192035)', borderColor: 'var(--border-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dimmer)', marginBottom: 8 }}>Plan Summary</div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {[
                  { label: 'subjects',    value: subjects.length,        color: '#f59e0b' },
                  { label: 'topics',      value: stats.totalTopics,      color: '#818cf8' },
                  { label: 'total hours', value: `${stats.totalHours}h`, color: '#34d399' },
                  { label: 'days left',   value: stats.daysLeft,         color: '#f87171' },
                ].map(i => (
                  <span key={i.label} style={{ fontSize: 13 }}>
                    <span style={{ color: i.color, fontWeight: 700 }}>{i.value}</span>
                    <span style={{ color: 'var(--text-dimmer)' }}> {i.label}</span>
                  </span>
                ))}
              </div>

              {hasOverflow && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={12} />
                  ~{estTopicsOver} topic{estTopicsOver !== 1 ? 's' : ''} won't fit — fix before generating
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
              {hasOverflow ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <button
                    onClick={onOpenFeasibility}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                      border: 'none', borderRadius: 10, padding: '11px 22px',
                      color: 'var(--bg-base)', fontWeight: 700, cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    <Wrench size={15} /> Fix &amp; Generate
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-dimmest)', textAlign: 'right' }}>
                    ~{estTopicsOver} topics won't fit at current settings
                  </span>
                </div>
              ) : (
                // Only show Generate button when there is no existing schedule,
                // or when canGenerate is true (subjects exist). When a schedule
                // already exists the button label changes to "Regenerate Plan"
                // so users clearly understand they are overwriting.
                canGenerate && (
                  <button
                    className="gen-btn"
                    onClick={handleGenerateClick}
                    style={{
                      background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                      border: 'none', borderRadius: 10, padding: '11px 22px',
                      color: 'var(--bg-base)',
                      fontWeight: 700, cursor: 'pointer',
                      fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <Zap size={15} />
                    {hasSchedule ? 'Regenerate Plan' : 'Generate Plan'}
                  </button>
                )
              )}
            </div>
          </div>
        </Card>
      </div>

    </div>
  );
}
