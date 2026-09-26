// client/src/context/ThemeContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

const THEMES = {
  dark: {
    '--bg-base':      '#080b28',
    '--bg-card':      '#111640',
    '--bg-deep':      '#0c1234',
    '--bg-header':    '#0a0f30',
    '--border-card':  '#2a3274',
    '--border-mid':   '#20275f',
    '--text-primary': '#eef2ff',
    '--text-muted':   '#c6cef3',
    '--text-dim':     '#9aa6d5',
    '--text-dimmer':  '#7784b8',
    '--text-dimmest': '#58649a',
    '--text-bright':  '#ffffff',
    '--text-soft':    '#d9dffd',
    '--accent':       '#6366f1',
    '--accent-dark':  '#4f46e5',
    '--accent-soft':  '#a78bfa',
    '--accent-hover': '#818cf8',
    '--indigo':       '#a78bfa',
    '--green':        '#2dd4bf',
    '--green-dark':   '#14b8a6',
    '--red':          '#fb7185',
    '--modal-bg':     '#10163f',
    '--input-bg':     '#151b4a',
    '--section-bg':   '#0f153d',
  },
  light: {
    '--bg-base':      '#f4f6ff',
    '--bg-card':      '#ffffff',
    '--bg-deep':      '#eef1ff',
    '--bg-header':    '#ffffff',
    '--border-card':  '#dce2fa',
    '--border-mid':   '#cbd4f2',
    '--text-primary': '#11183f',
    '--text-muted':   '#354171',
    '--text-dim':     '#59658f',
    '--text-dimmer':  '#65709b',
    '--text-dimmest': '#8792b8',
    '--text-bright':  '#0b1030',
    '--text-soft':    '#34406d',
    '--accent':       '#4f46e5',
    '--accent-dark':  '#4338ca',
    '--accent-soft':  '#6d5ce8',
    '--accent-hover': '#6366f1',
    '--indigo':       '#6d5ce8',
    '--green':        '#0f766e',
    '--green-dark':   '#115e59',
    '--red':          '#be123c',
    '--modal-bg':     '#ffffff',
    '--input-bg':     '#f7f8ff',
    '--section-bg':   '#eaedff',
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
