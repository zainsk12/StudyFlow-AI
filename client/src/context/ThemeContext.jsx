// client/src/context/ThemeContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

const THEMES = {
  dark: {
    '--bg-base':      '#0d1117',
    '--bg-card':      '#1c2030',
    '--bg-deep':      '#111827',
    '--bg-header':    '#13192a',
    '--border-card':  '#252d42',
    '--border-mid':   '#1e293b',
    '--text-primary': '#e2e8f0',
    '--text-muted':   '#94a3b8',
    '--text-dim':     '#64748b',
    '--text-dimmer':  '#475569',
    '--text-dimmest': '#334155',
    '--modal-bg':     '#111827',
    '--input-bg':     '#1c2030',
    '--section-bg':   '#13192a',
  },
  light: {
    '--bg-base':      '#f1f5f9',
    '--bg-card':      '#ffffff',
    '--bg-deep':      '#f8fafc',
    '--bg-header':    '#ffffff',
    '--border-card':  '#e2e8f0',
    '--border-mid':   '#cbd5e1',
    '--text-primary': '#0f172a',
    '--text-muted':   '#475569',
    '--text-dim':     '#64748b',
    '--text-dimmer':  '#94a3b8',
    '--text-dimmest': '#cbd5e1',
    '--modal-bg':     '#ffffff',
    '--input-bg':     '#f8fafc',
    '--section-bg':   '#f1f5f9',
  },
};

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode) {
  const resolved = mode === 'system' ? getSystemTheme() : mode;
  const vars = THEMES[resolved] || THEMES.dark;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute('data-theme', resolved);
  document.body.setAttribute('data-theme', resolved);
  document.body.style.background = vars['--bg-base'];
  document.body.style.color = vars['--text-primary'];
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('sf_theme') || 'dark';
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('sf_theme', theme);
  }, [theme]);

  // Listen for system theme changes when mode = 'system'
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);