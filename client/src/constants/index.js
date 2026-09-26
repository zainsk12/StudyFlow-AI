export const APP_NAME = 'StudyFlow AI';

export const COLORS = [
  '#9333ea', '#c084fc', '#34d399', '#f87171',
  '#60a5fa', '#d8b4fe', '#e879f9', '#38bdf8',
];

export const DIFF_HRS   = { easy: 1, medium: 1.5, hard: 2.5 };
export const DIFF_CLR   = { easy: '#34d399', medium: '#c026d3', hard: '#f87171' };
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
