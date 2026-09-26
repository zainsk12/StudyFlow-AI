// client/src/context/ThemeContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

const THEMES = {
  dark: {
    '--bg-base':      '#0b0614',
    '--bg-card':      '#170d24',
    '--bg-deep':      '#10081a',
    '--bg-header':    '#100719',
    '--border-card':  '#3b2850',
    '--border-mid':   '#291b39',
    '--text-primary': '#f1e8f7',
    '--text-muted':   '#c2b3d0',
    '--text-dim':     '#a08cad',
    '--text-dimmer':  '#7d6b8d',
    '--text-dimmest': '#594768',
    '--text-bright':  '#fffaff',
    '--text-soft':    '#decfe8',
    '--modal-bg':     '#10081a',
    '--input-bg':     '#1a0f28',
    '--section-bg':   '#13091f',
  },
  light: {
    '--bg-base':      '#f7f2fb',
    '--bg-card':      '#ffffff',
    '--bg-deep':      '#fbf9fd',
    '--bg-header':    '#ffffff',
    '--border-card':  '#e8ddf0',
    '--border-mid':   '#d8c9e4',
    '--text-primary': '#271638',
    '--text-muted':   '#563b6c',
    '--text-dim':     '#6e5780',
    '--text-dimmer':  '#725b83',
    '--text-dimmest': '#927ca1',
    '--text-bright':  '#24122f',
    '--text-soft':    '#453354',
    '--modal-bg':     '#ffffff',
    '--input-bg':     '#fbf9fd',
    '--section-bg':   '#f2eaf7',
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
