// client/src/components/Schedule/PomodoroTimer.jsx
// Header-embedded widget.
// Pill: mini SVG ring + large countdown + mode label → click opens fixed dropdown.
// All timer state lives in App.jsx (survives tab switches).

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Coffee, Zap, Square, Timer, X } from 'lucide-react';

export const FOCUS_SEC = 25 * 60;
export const BREAK_SEC =  5 * 60;

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

// ── Small ring for the header pill ───────────────────────────────────────
function MiniRing({ pct, color, size = 36 }) {
  const r    = (size / 2) - 4;
  const cx   = size / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke="rgba(255,255,255,0.08)" strokeWidth={3.5} />
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke={color} strokeWidth={3.5}
        strokeDasharray={`${circ * pct} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
}

// ── Large ring for the dropdown panel ────────────────────────────────────
function Ring({ pct, color }) {
  const r    = 52;
  const cx   = 60;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke={color} strokeWidth={7}
        strokeDasharray={`${circ * pct} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    </svg>
  );
}

// ── Button helpers ────────────────────────────────────────────────────────
function primaryBtn(c1, c2) {
  return {
    flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
    background: `linear-gradient(135deg,${c1},${c2})`,
    color: '#0d1117', cursor: 'pointer', fontSize: 12, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    boxShadow: `0 4px 14px ${c1}44`,
  };
}
const secondaryBtn = {
  flex: 1, padding: '9px 0', borderRadius: 10,
  background: 'rgba(255,255,255,0.05)', border: '1px solid #1e293b',
  color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 500,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
};
const breakBtn = {
  flex: 1, padding: '9px 0', borderRadius: 10,
  background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)',
  color: '#34d399', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
};
const doneBtn = {
  flex: 1, padding: '9px 0', borderRadius: 10,
  background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
  color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
};

export default function PomodoroTimer({
  phase, setPhase,
  focusLeft, setFocusLeft,
  breakLeft, setBreakLeft,
  sessions, setSessions,
  currentTopicName,
}) {
  const [open, setOpen] = useState(false);
  const tickRef         = useRef(null);
  const wrapRef         = useRef(null);

  // ── Tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(tickRef.current);
    if (phase === 'running') {
      tickRef.current = setInterval(() => {
        setFocusLeft(prev => {
          if (prev <= 1) {
            clearInterval(tickRef.current);
            setSessions(s => s + 1);
            setPhase('idle');
            setFocusLeft(FOCUS_SEC);
            notify('🍅 Focus session complete!', 'Take a well-earned break.');
            return FOCUS_SEC;
          }
          return prev - 1;
        });
      }, 1000);
    }
    if (phase === 'onBreak') {
      tickRef.current = setInterval(() => {
        setBreakLeft(prev => {
          if (prev <= 1) {
            clearInterval(tickRef.current);
            setPhase('breakDone');
            notify('☕ Break over!', 'Ready to focus again?');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(tickRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Tab title ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'running')      document.title = `${fmt(focusLeft)} 🍅 — StudyFlow AI`;
    else if (phase === 'onBreak') document.title = `${fmt(breakLeft)} ☕ — StudyFlow AI`;
    else                          document.title = 'StudyFlow AI';
  }, [phase, focusLeft, breakLeft]);

  // ── Close on outside click ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [open]);

  useEffect(() => {
    if (open && Notification.permission === 'default') Notification.requestPermission();
  }, [open]);

  function notify(title, body) {
    if (Notification.permission === 'granted') new Notification(title, { body });
  }

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleStart           = () => setPhase('running');
  const handlePause           = () => setPhase('paused');
  const handleResume          = () => setPhase('running');
  const handleReset           = () => { setPhase('idle'); setFocusLeft(FOCUS_SEC); setBreakLeft(BREAK_SEC); };
  const handleDone            = () => { setSessions(s => s + 1); setPhase('idle'); setFocusLeft(FOCUS_SEC); setBreakLeft(BREAK_SEC); };
  const handleTakeBreak       = () => { setBreakLeft(BREAK_SEC); setPhase('onBreak'); };
  const handleResumeFromBreak = () => setPhase('running');

  // ── Derived ──────────────────────────────────────────────────────────
  const isBreaking  = phase === 'onBreak' || phase === 'breakDone';
  const accent      = isBreaking ? '#34d399' : '#f59e0b';
  const accentDim   = isBreaking ? 'rgba(52,211,153,0.12)'  : 'rgba(245,158,11,0.12)';
  const accentBdr   = isBreaking ? 'rgba(52,211,153,0.30)'  : 'rgba(245,158,11,0.30)';
  const displayTime = isBreaking ? breakLeft : focusLeft;
  const totalTime   = isBreaking ? BREAK_SEC : FOCUS_SEC;
  const ringPct     = displayTime / totalTime;
  const isActive    = phase === 'running' || phase === 'onBreak';

  const modeLabel = phase === 'onBreak'   ? 'BREAK'
                  : phase === 'breakDone' ? 'DONE'
                  : phase === 'paused'    ? 'PAUSED'
                  : phase === 'running'   ? 'FOCUS'
                  :                         'POMODORO';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>

      {/* ── Header pill ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Pomodoro Timer"
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          background:   open ? accentDim : 'rgba(255,255,255,0.04)',
          border:       `1.5px solid ${open ? accentBdr : '#252d42'}`,
          borderRadius: 14,
          padding:      '7px 14px 7px 8px',
          cursor:       'pointer',
          transition:   'all 0.2s',
          userSelect:   'none',
          boxShadow:    open ? `0 0 0 3px ${accent}18` : 'none',
        }}
      >
        {/* Mini ring + live dot */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <MiniRing pct={ringPct} color={accent} size={36} />
          {isActive && (
            <span style={{
              position: 'absolute', top: 1, right: 1,
              width: 8, height: 8, borderRadius: '50%',
              background: accent, border: '1.5px solid #0d1117',
              boxShadow: `0 0 6px ${accent}`,
            }} />
          )}
        </div>

        {/* Countdown + mode */}
        <div style={{ lineHeight: 1 }}>
          <div style={{
            fontSize: 16, fontWeight: 800, color: '#f1f5f9',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}>
            {fmt(displayTime)}
          </div>
          <div style={{
            fontSize: 9, fontWeight: 600, color: accent,
            textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3,
          }}>
            {modeLabel}
          </div>
        </div>

        {/* Sessions badge */}
        {sessions > 0 && (
          <span style={{
            background: accentDim, border: `1px solid ${accentBdr}`,
            borderRadius: 6, padding: '2px 7px',
            fontSize: 11, fontWeight: 700, color: accent, marginLeft: 2,
          }}>
            {sessions}🍅
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={{
          position:     'fixed',
          top:          72,
          right:        136,
          zIndex:       9000,
          width:        292,
          background:   'linear-gradient(160deg,#161d2e 0%,#111827 100%)',
          border:       `1.5px solid ${accent}55`,
          borderRadius: 20,
          boxShadow:    `0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)`,
          overflow:     'hidden',
        }}>

          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.025)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9,
                background: accentDim, border: `1px solid ${accentBdr}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Timer size={14} color={accent} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', lineHeight: 1 }}>Pomodoro Timer</div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>25 min focus · 5 min break</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: 'transparent', border: 'none',
              color: '#334155', cursor: 'pointer', padding: 4,
              borderRadius: 6, display: 'flex', alignItems: 'center',
            }}>
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: '18px 18px 20px' }}>
            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 7, marginBottom: 18 }}>
              {[
                { label: 'Focus', icon: <Zap size={11}/>,    active: !isBreaking, c:'#f59e0b', d:'rgba(245,158,11,0.15)', b:'rgba(245,158,11,0.3)' },
                { label: 'Break', icon: <Coffee size={11}/>, active:  isBreaking, c:'#34d399', d:'rgba(52,211,153,0.15)', b:'rgba(52,211,153,0.3)' },
              ].map(m => (
                <div key={m.label} style={{
                  flex:1, padding:'7px 0', borderRadius:10, fontSize:11, fontWeight:600, textAlign:'center',
                  background: m.active ? m.d : 'rgba(255,255,255,0.03)',
                  color:      m.active ? m.c : '#334155',
                  border:    `1px solid ${m.active ? m.b : '#1e293b'}`,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:5, transition:'all 0.2s',
                }}>
                  {m.icon} {m.label}
                </div>
              ))}
            </div>

            {/* Ring */}
            <div style={{ position:'relative', width:120, height:120, margin:'0 auto 16px' }}>
              <Ring pct={ringPct} color={accent} />
              <div style={{
                position:'absolute', inset:0,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              }}>
                <div style={{ fontSize:30, fontWeight:800, color:'#f1f5f9', fontVariantNumeric:'tabular-nums', letterSpacing:'-0.03em', lineHeight:1 }}>
                  {fmt(displayTime)}
                </div>
                <div style={{ fontSize:8.5, color:accent, textTransform:'uppercase', letterSpacing:'0.14em', marginTop:5, fontWeight:600 }}>
                  {modeLabel}
                </div>
              </div>
            </div>

            {/* Current topic */}
            {currentTopicName && (
              <div style={{
                display:'flex', alignItems:'center', gap:8,
                padding:'7px 11px', borderRadius:9,
                background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)',
                marginBottom:14,
              }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:accent, flexShrink:0 }} />
                <div style={{ fontSize:11, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {currentTopicName}
                </div>
              </div>
            )}

            {/* Session dots */}
            {sessions > 0 && (
              <div style={{ display:'flex', gap:5, justifyContent:'center', marginBottom:14, flexWrap:'wrap' }}>
                {Array.from({ length: Math.min(sessions, 8) }).map((_,i) => (
                  <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:'#f59e0b', opacity:0.85 }} />
                ))}
                {sessions > 8 && <span style={{ fontSize:11, color:'#f59e0b' }}>+{sessions-8}</span>}
              </div>
            )}

            {/* Break-done notice */}
            {phase === 'breakDone' && (
              <div style={{
                padding:'8px 12px', borderRadius:9, marginBottom:12,
                background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.2)',
                fontSize:11, color:'#34d399', textAlign:'center',
              }}>
                ☕ Break finished — ready to resume focus?
              </div>
            )}

            {/* Buttons */}
            {phase === 'idle' && (
              <button onClick={handleStart} style={primaryBtn('#f59e0b','#d97706')}>
                <Play size={14}/> Start Focus
              </button>
            )}
            {phase === 'running' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'flex', gap:7 }}>
                  <button onClick={handleReset} style={secondaryBtn}><RotateCcw size={12}/> Reset</button>
                  <button onClick={handlePause} style={secondaryBtn}><Pause size={12}/> Pause</button>
                </div>
                <div style={{ display:'flex', gap:7 }}>
                  <button onClick={handleTakeBreak} style={breakBtn}><Coffee size={12}/> Take Break</button>
                  <button onClick={handleDone}      style={doneBtn}><Square  size={12}/> Done</button>
                </div>
              </div>
            )}
            {phase === 'paused' && (
              <div style={{ display:'flex', gap:7 }}>
                <button onClick={handleReset}  style={secondaryBtn}><RotateCcw size={12}/> Reset</button>
                <button onClick={handleResume} style={primaryBtn('#f59e0b','#d97706')}><Play size={14}/> Resume</button>
              </div>
            )}
            {phase === 'onBreak' && (
              <div style={{ display:'flex', gap:7 }}>
                <button onClick={handleReset}           style={secondaryBtn}><RotateCcw size={12}/> Reset</button>
                <button onClick={handleResumeFromBreak} style={primaryBtn('#34d399','#10b981')}><Play size={14}/> End Break</button>
              </div>
            )}
            {phase === 'breakDone' && (
              <div style={{ display:'flex', gap:7 }}>
                <button onClick={handleReset}           style={secondaryBtn}><RotateCcw size={12}/> Reset</button>
                <button onClick={handleResumeFromBreak} style={primaryBtn('#f59e0b','#d97706')}><Play size={14}/> Resume Focus</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}