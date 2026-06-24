import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { COLORS } from '../constants';
import { buildSchedule, buildScheduleFromToday, computeStats } from '../utils/scheduler';

const genId = () => Math.random().toString(36).slice(2, 9);

function localTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const loadStreak = (uid) => {
  try { return JSON.parse(localStorage.getItem(`sf_streak_${uid}`)) || { count: 0, lastDate: null }; }
  catch { return { count: 0, lastDate: null }; }
};
const saveStreak = (uid, data) => {
  try { localStorage.setItem(`sf_streak_${uid}`, JSON.stringify(data)); } catch {}
};

const defaultExamDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ── localStorage helpers ───────────────────────────────────────────────────
const loadFromStorage = (uid) => {
  try {
    if (!uid) return null;
    const raw = localStorage.getItem(`sf_planner_${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const saveToStorage = (uid, data) => {
  try {
    if (!uid) return;
    localStorage.setItem(`sf_planner_${uid}`, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
};

// ── API helpers ────────────────────────────────────────────────────────────
const API = '/api/schedule';

async function fetchFullPlan() {
  try {
    const res = await fetch(`${API}/full`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch { return null; }
}

async function pushFullPlan(payload) {
  try {
    await fetch(`${API}/full`, {
      method:  'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
  } catch { /* silent */ }
}

// ── Source picker: returns whichever snapshot is newer ────────────────────
// Both server and localStorage snapshots carry a `savedAt` ms timestamp.
// If either is missing a timestamp we conservatively prefer the server
// (it's the authoritative store), UNLESS the local copy has a timestamp
// and the server copy doesn't — that means the local copy was saved after
// the last successful server push, so we prefer local.
function pickNewerSource(serverData, localData) {
  if (!serverData && !localData) return null;
  if (!serverData) return localData;
  if (!localData)  return serverData;

  const serverTime = serverData.savedAt ?? 0;
  const localTime  = localData.savedAt  ?? 0;

  // If both have timestamps, use the newer one.
  if (serverTime > 0 || localTime > 0) {
    return localTime > serverTime ? localData : serverData;
  }

  // Neither has a timestamp (legacy data) — prefer server as before.
  return serverData;
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useStudyPlanner(userId, _token) {
  const uid = userId ? String(userId) : null;

  // Initialize state from localStorage immediately so first render isn't blank.
  const savedAtMount = loadFromStorage(uid);

  const [subjects,      setSubjects]      = useState(savedAtMount?.subjects      ?? []);
  const [examDate,      setExamDate]      = useState(savedAtMount?.examDate      ?? defaultExamDate());
  const [dailyHours,    setDailyHours]    = useState(savedAtMount?.dailyHours    ?? 4);
  const [schedule,      setSchedule]      = useState(savedAtMount?.schedule      ?? []);
  const [dayIdx,        setDayIdx]        = useState(savedAtMount?.dayIdx        ?? 0);
  const [overflowCount, setOverflowCount] = useState(savedAtMount?.overflowCount ?? 0);
  const [streak, setStreak] = useState(() => uid ? loadStreak(uid).count : 0);

  const [lastAddedSubjectId, setLastAddedSubjectId] = useState(null);
  const [lastAddedTopicId,   setLastAddedTopicId]   = useState(null);

  // ── persistEnabled gate ───────────────────────────────────────────────────
  // Stays FALSE until the first fetchFullPlan() settles, preventing any
  // accidental write during the hydration window.
  const persistEnabled = useRef(false);
  const prevUidRef     = useRef(uid);
  const debounceRef    = useRef(null);

  // ── latestPayloadRef ──────────────────────────────────────────────────────
  // Always holds the most-recent planner state so the beforeunload flush
  // can read it without stale-closure issues (no dep-array churn needed).
  const latestPayloadRef = useRef(null);

  useEffect(() => {
    latestPayloadRef.current = {
      subjects, examDate, dailyHours, schedule, dayIdx, overflowCount,
    };
  }, [subjects, examDate, dailyHours, schedule, dayIdx, overflowCount]);

  // ── beforeunload flush ────────────────────────────────────────────────────
  // The persist effect debounces server saves by 2 s. If the user refreshes
  // before that window completes the server still has stale data, and the
  // next hydration overwrites the correct localStorage data — wiping
  // progress, overflow fixes, and the schedule.
  //
  // Fix: on every page unload (refresh, close, navigate away) we cancel the
  // pending debounce and fire an immediate PUT with keepalive:true.
  // keepalive tells the browser to complete the request even after the page
  // is torn down, so the server is always up-to-date before the next load.
  useEffect(() => {
    if (!uid) return;

    const flush = () => {
      // Only flush if the gate is open (we are past the hydration window).
      if (!persistEnabled.current || !latestPayloadRef.current) return;

      clearTimeout(debounceRef.current);

      const payload = {
        ...latestPayloadRef.current,
        savedAt: Date.now(),
      };

      // keepalive: true — browser keeps the request alive after page unload.
      // This is the only reliable way to do a same-origin credentialed XHR
      // during unload; sendBeacon only supports POST and can't set headers.
      fetch(`${API}/full`, {
        method:      'PUT',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(payload),
        keepalive:   true,
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [uid]); // uid is the only thing that changes the endpoint identity

  // ── Hydrate from server on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!uid) {
      persistEnabled.current = true;
      return;
    }

    persistEnabled.current = false;

    const local = loadFromStorage(uid);

    fetchFullPlan().then(serverData => {
      // Pick whichever snapshot is newer: localStorage (savedAt = last
      // browser-side change) vs server (savedAt = last successful PUT).
      // This prevents stale server data from overwriting a localStorage copy
      // that was updated after the last successful server push (e.g. the user
      // marked topics done and refreshed before the 2-s debounce fired).
      const src = pickNewerSource(serverData, local);

      if (src) {
        setSubjects(src.subjects      ?? []);
        setExamDate(src.examDate      ?? defaultExamDate());
        setDailyHours(src.dailyHours  ?? 4);
        setSchedule(src.schedule      ?? []);
        setDayIdx(src.dayIdx          ?? 0);
        setOverflowCount(src.overflowCount ?? 0);
        // Mirror the winning source to localStorage
        saveToStorage(uid, src);
      }
    }).finally(() => {
      persistEnabled.current = true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // ── Reload when user switches account ─────────────────────────────────────
  useEffect(() => {
    if (prevUidRef.current === uid) return;
    prevUidRef.current = uid;
    if (!uid) return;

    persistEnabled.current = false;

    const local = loadFromStorage(uid);

    fetchFullPlan().then(serverData => {
      const src = pickNewerSource(serverData, local);
      if (src) {
        setSubjects(src.subjects      ?? []);
        setExamDate(src.examDate      ?? defaultExamDate());
        setDailyHours(src.dailyHours  ?? 4);
        setSchedule(src.schedule      ?? []);
        setDayIdx(src.dayIdx          ?? 0);
        setOverflowCount(src.overflowCount ?? 0);
        saveToStorage(uid, src);
      }
    }).finally(() => {
      persistEnabled.current = true;
    });
  }, [uid]);

  // ── Persist state to localStorage + server (debounced) ────────────────────
  useEffect(() => {
    if (!persistEnabled.current) return;
    if (!uid) return;

    // Stamp every save with the current ms timestamp so the hydration logic
    // above can compare freshness between localStorage and the server.
    const payload = {
      subjects, examDate, dailyHours, schedule, dayIdx, overflowCount,
      savedAt: Date.now(),
    };

    // localStorage: always immediate (fast, synchronous)
    saveToStorage(uid, payload);

    // Server: debounced — the beforeunload flush handles the "refresh too fast"
    // edge case so we can keep a comfortable 2 s window here.
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushFullPlan(payload), 2000);
  }, [uid, subjects, examDate, dailyHours, schedule, dayIdx, overflowCount]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const stats = useMemo(
    () => computeStats(subjects, examDate, dailyHours),
    [subjects, examDate, dailyHours]
  );

  const behindCount = useMemo(() => {
    if (!schedule.length) return 0;
    const todayStr = localTodayStr();
    const overdueTopicIds = new Set();
    schedule.forEach(day => {
      if (day.date < todayStr) {
        day.sessions.forEach(s => overdueTopicIds.add(s.topicId));
      }
    });
    const pendingTopicIds = new Set(
      subjects.flatMap(s =>
        s.topics.filter(t => t.status !== 'done').map(t => t.id)
      )
    );
    return [...overdueTopicIds].filter(id => pendingTopicIds.has(id)).length;
  }, [schedule, subjects]);

  // ── Actions ────────────────────────────────────────────────────────────────
  // Safe setter: clamps value to valid schedule bounds.
  // Prevents out-of-range dayIdx when schedule shrinks after regen.
  const setSafeDayIdx = useCallback((idxOrUpdater) => {
    setDayIdx(prev => {
      const next = typeof idxOrUpdater === 'function' ? idxOrUpdater(prev) : idxOrUpdater;
      const len  = schedule.length;
      if (len === 0) return 0;
      return Math.max(0, Math.min(next ?? 0, len - 1));
    });
  }, [schedule.length]);

  const generatePlan = () => {
    const { days, overflowCount: oc } = buildSchedule(subjects, examDate, dailyHours);
    setSchedule(days);
    setOverflowCount(oc);
    // Clamp to new schedule length (may be smaller than current dayIdx)
    setDayIdx(prev => (days.length === 0 ? 0 : Math.min(prev, days.length - 1)));
    return days;
  };

  const regeneratePlan = () => {
    const { days, overflowCount: oc } = buildScheduleFromToday(subjects, examDate, dailyHours);
    setSchedule(days);
    setOverflowCount(oc);
    // Clamp to new schedule length (may be smaller than current dayIdx)
    setDayIdx(prev => (days.length === 0 ? 0 : Math.min(prev, days.length - 1)));
    return days;
  };

  const updateStreak = useCallback(() => {
    if (!uid) return;
    const today = localTodayStr();
    const prev  = loadStreak(uid);
    if (prev.lastDate === today) return;
    const newCount = prev.lastDate === yesterdayStr() ? prev.count + 1 : 1;
    saveStreak(uid, { count: newCount, lastDate: today });
    setStreak(newCount);
  }, [uid]);

  const toggleTopic = (sid, tid) =>
  setSubjects(prev =>
    prev.map(s =>
      s.id !== sid ? s : {
        ...s,
        topics: s.topics.map(t => {
          if (t.id !== tid) return t;
          const next = t.status === 'done' ? 'pending' : 'done';
          if (next === 'done') updateStreak();
          return { ...t, status: next };
        }),
      }
    )
  );

  const unmarkAll = () =>
    setSubjects(prev =>
      prev.map(s => ({
        ...s,
        topics: s.topics.map(t => ({ ...t, status: 'pending' })),
      }))
    );

  const addSubject = () => {
    const id = genId();
    setSubjects(prev => [
      ...prev,
      { id, name: '', color: COLORS[prev.length % COLORS.length], topics: [] },
    ]);
    setLastAddedSubjectId(id);
    return id;
  };

  const removeSubject = id =>
    setSubjects(prev => prev.filter(s => s.id !== id));

  const updateSubject = (id, key, value) =>
    setSubjects(prev => prev.map(s => (s.id !== id ? s : { ...s, [key]: value })));

  const addTopic = sid => {
    const id = genId();
    setSubjects(prev =>
      prev.map(s =>
        s.id !== sid ? s : {
          ...s,
          topics: [...s.topics, { id, name: '', difficulty: 'medium', status: 'pending' }],
        }
      )
    );
    setLastAddedTopicId(id);
    return id;
  };

  const removeTopic = (sid, tid) =>
    setSubjects(prev =>
      prev.map(s => s.id !== sid ? s : { ...s, topics: s.topics.filter(t => t.id !== tid) })
    );

  const updateTopic = (sid, tid, key, value) =>
    setSubjects(prev =>
      prev.map(s =>
        s.id !== sid ? s : {
          ...s,
          topics: s.topics.map(t => t.id !== tid ? t : { ...t, [key]: value }),
        }
      )
    );

  const importSubjects = (newSubjects) => {
    if (!newSubjects.length) return;
    setSubjects(prev => [...prev, ...newSubjects]);
    setLastAddedSubjectId(newSubjects[0].id);
  };

  const clearAll = useCallback(() => {
    const freshDate = defaultExamDate();
    const empty = {
      subjects: [], schedule: [], dayIdx: 0,
      examDate: freshDate, dailyHours: 4, overflowCount: 0,
      savedAt: Date.now(),
    };
    setSubjects([]);
    setSchedule([]);
    setDayIdx(0);
    setExamDate(freshDate);
    setDailyHours(4);
    setOverflowCount(0);
    setLastAddedSubjectId(null);
    setLastAddedTopicId(null);
    if (uid) {
      saveToStorage(uid, empty);
      pushFullPlan(empty);
      saveStreak(uid, { count: 0, lastDate: null });
      setStreak(0);
    }
  }, [uid]);

  return {
    subjects, examDate, dailyHours, schedule, dayIdx, stats,
    behindCount, overflowCount,
    lastAddedSubjectId, lastAddedTopicId,
    setExamDate, setDailyHours, setDayIdx: setSafeDayIdx,
    generatePlan, regeneratePlan, toggleTopic,
    addSubject, removeSubject, updateSubject,
    addTopic,   removeTopic,   updateTopic,
    importSubjects,
    clearAll, unmarkAll,
    streak,
  };
}