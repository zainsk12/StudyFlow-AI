/* ── Section Label ───────────────────────────────────────── */
export function SecLabel({ children, icon }) {
  return (
    <div
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           8,
        fontSize:      11,
        fontWeight:    600,
        color:         'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom:  14,
      }}
    >
      <span style={{ color: 'var(--accent)' }}>{icon}</span>
      {children}
    </div>
  );
}

/* ── Difficulty / tag Pill ───────────────────────────────── */
export function Pill({ label, color, bg }) {
  return (
    <span
      style={{
        fontSize:   11,
        background: bg || `${color}18`,
        color,
        padding:    '2px 8px',
        borderRadius: 4,
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

/* ── Progress Bar ────────────────────────────────────────── */
export function ProgressBar({ pct, color = 'var(--accent)', height = 6 }) {
  return (
    <div style={{ height, background: 'var(--bg-deep)', borderRadius: height, overflow: 'hidden' }}>
      <div
        style={{
          height:     '100%',
          width:      `${pct}%`,
          background: color,
          borderRadius: height,
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  );
}

/* ── Metric Card ─────────────────────────────────────────── */
export function MetricCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background:   'var(--bg-deep)',
        border:       '1px solid var(--border-mid)',
        borderRadius: 10,
        padding:      '14px 16px',
        textAlign:    'center',
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'Georgia', serif", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dimmer)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

/* ── Empty State ─────────────────────────────────────────── */
export function EmptyState({ emoji, msg, action, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{emoji}</div>
      <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 16 }}>{msg}</div>
      {action && (
        <button
          onClick={onAction}
          style={{
            background:   'rgba(99,102,241,0.1)',
            border:       '1px solid rgba(99,102,241,0.3)',
            borderRadius: 8,
            padding:      '8px 18px',
            color:        'var(--accent)',
            cursor:       'pointer',
            fontSize:     13,
            fontFamily:   'inherit',
          }}
        >
          {action}
        </button>
      )}
    </div>
  );
}
