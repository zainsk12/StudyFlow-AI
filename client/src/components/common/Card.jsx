export default function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background:   '#1c2030',
        border:       '1px solid #252d42',
        borderRadius: 12,
        padding:      20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
