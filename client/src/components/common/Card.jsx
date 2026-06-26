export default function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background:   'var(--bg-card)',
        border:       '1px solid var(--border-card)',
        borderRadius: 12,
        padding:      20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
