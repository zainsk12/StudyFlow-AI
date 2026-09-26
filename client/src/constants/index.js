export const APP_NAME = 'StudyFlow AI';

export const COLORS = [
  '#6366f1', '#8b5cf6', '#2dd4bf', '#fb7185',
  '#38bdf8', '#818cf8', '#14b8a6', '#a78bfa',
];

export const DIFF_HRS   = { easy: 1, medium: 1.5, hard: 2.5 };
export const DIFF_CLR   = { easy: '#0f766e', medium: '#6d5ce8', hard: '#be123c' };
export const DIFF_LBL   = { easy: 'Easy',    medium: 'Med',     hard: 'Hard'    };
export const DIFF_ORDER = { hard: 0, medium: 1, easy: 2 };

// FIX 3: Removed INITIAL_SUBJECTS — it was a leftover demo/seed constant that
// is never imported or used anywhere in the codebase. useStudyPlanner hydrates
// from the server (source of truth) or starts with an empty array; it never
// referenced this. Keeping dead exports adds noise and causes tree-shake
// warnings. The genId helper it depended on is also removed since it was only
// used by INITIAL_SUBJECTS.

export const TABS = [
  { id: 'setup',    label: 'Setup'    },
  { id: 'schedule', label: 'Schedule' },
  { id: 'progress', label: 'Progress' },
  { id: 'stats',    label: 'Stats'    },
  { id: 'ai',       label: 'AI Coach' },
];

export const QUICK_PROMPTS = [
  'How do I start?',
  'Tips for hard topics?',
  'Am I on track?',
];

export const AI_WELCOME =
  "Hi! I'm your AI study coach. I know your full study plan and can help with strategies, tips for difficult topics, time management, and more. What would you like to know?";
