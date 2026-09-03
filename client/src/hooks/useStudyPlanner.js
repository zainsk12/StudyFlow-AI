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
    const res = await fetch(`${API}/full`, {
      method:  'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    // Module 2: return the server's response (contains the bumped `version`)
    // so callers can keep track of what the server currently has, instead of
    // silently discarding it as before. Existing fire-and-forget call sites
    // (e.g. clearAll) are unaffected — they simply don't await/use the result.
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Module 2: query the lightweight sync-status endpoint instead of always
// pulling the full plan, so routine "is anything new?" checks don't move the
// whole payload over the wire.
async function fetchSyncStatus(knownVersion) {
  try {
    const params = new URLSearchParams({ version: String(knownVersion ?? 0) });
    const res = await fetch(`${API}/sync?${params.toString()}`, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// One-time migration of a legacy `sf_streak_<uid>` localStorage value onto
// the server (Module 1: move Study Streak to MongoDB). The server endpoint
// is idempotent (guarded by `migratedStreakFromLocalStorage`), so it's safe
// to call this every time hydration finds an un-migrated server plan — it
// will simply no-op on subsequent calls.
async function migrateLegacyStreak(legacy) {
  try {
    const res = await fetch(`${API}/streak/migrate`, {
      method:  'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ count: legacy.count, lastDate: legacy.lastDate }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Resolves the effective streak on hydration: server is the source of truth
// once migrated. If the server hasn't migrated yet, the legacy localStorage
// streak (if any) is pushed up via the idempotent /streak/migrate endpoint
// exactly once; the server's response (post-migration) then wins.
async function resolveServerStreak(uid, serverData) {
  if (serverData && serverData.migratedStreakFromLocalStorage) {
    return serverData.streak ?? { count: 0, lastDate: null };
  }

  const legacy = loadStreak(uid);
  const migrated = await migrateLegacyStreak(legacy);
  if (migrated) return migrated.streak ?? { count: 0, lastDate: null };

  // Migration call failed (offline, etc.) — fall back to whatever the server
  // already reported, else the legacy local value, so the UI isn't blank.
  return serverData?.streak ?? legacy;
}

// ── Source picker: returns whichever snapshot is newer ────────────────────
// Both server and localStorage snapshots carry a `savedAt` ms timestamp.
// If either is missing a timestamp we conservatively prefer the server
// (it's the authoritative store), UNLESS the local copy has a timestamp
// and the server copy doesn't — that means the local copy was saved after
// the last successful server push, so we prefer local.
//
// KNOWN LIMITATION — cross-device sync is last-write-wins (roadmap task 2.4):
// The whole planner state is persisted as one snapshot, and reconciliation
// picks the newer snapshot wholesale rather than merging field-by-field. This
// is correct and lossless for the single-device case this app targets (the
// beforeunload flush + debounce keep the server current), but if the SAME
// account edits on TWO devices concurrently, the device that saves last
// overwrites the other's unsynced changes. A per-topic merge would be needed
// to eliminate this; it is intentionally deferred because topic status is not
// monotonic (un-marking is a supported action), so a naive union would
// resurrect intentionally-cleared progress. Treat this as documented expected
// behaviour, not a regression.
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
export function useStudyPlanner(userId) {
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
  const [streakLastDate, setStreakLastDate] = useState(() => uid ? loadStreak(uid).lastDate : null);

  const [lastAddedSubjectId, setLastAddedSubjectId] = useState(null);
  const [lastAddedTopicId,   setLastAddedTopicId]   = useState(null);

  // ── persistEnabled gate ───────────────────────────────────────────────────
  // Stays FALSE until the first fetchFullPlan() settles, preventing any
  // accidental write during the hydration window.
  const persistEnabled = useRef(false);
  const prevUidRef     = useRef(uid);
  const debounceRef    = useRef(null);

  // ── Module 2: sync engine state ───────────────────────────────────────────
  // The last server `version` this tab has confirmed (via hydration, a
  // successful push, or a sync-status check). Used to ask the server "is
  // there anything newer than this?" without re-sending the whole plan.
  const serverVersionRef = useRef(0);
  // Guards against overlapping sync-status checks / downloads.
  const isSyncingRef     = useRef(false);
  // Set right before applying a downloaded server snapshot so the very next
  // run of the persist effect (triggered by those same setState calls)
  // doesn't immediately re-upload the data we just downloaded.
  const skipNextPersistRef = useRef(false);

  // ── latestPayloadRef ──────────────────────────────────────────────────────
  // Always holds the most-recent planner state so the beforeunload flush
  // can read it without stale-closure issues (no dep-array churn needed).
  const latestPayloadRef = useRef(null);

  useEffect(() => {
    latestPayloadRef.current = {
      subjects, examDate, dailyHours, schedule, dayIdx, overflowCount,
      streak: { count: streak, lastDate: streakLastDate },
    };
  }, [subjects, examDate, dailyHours, schedule, dayIdx, overflowCount, streak, streakLastDate]);

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
      // Module 2: remember whatever version the server reported (even if we
      // end up keeping the local snapshot below) so later sync-status checks
      // compare against a real baseline instead of 0.
      serverVersionRef.current = serverData?.version ?? 0;

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

      resolveServerStreak(uid, serverData).then(resolved => {
        setStreak(resolved.count ?? 0);
        setStreakLastDate(resolved.lastDate ?? null);
        saveStreak(uid, resolved);
      });
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
      // Module 2: same baseline tracking as the initial-mount hydration above.
      serverVersionRef.current = serverData?.version ?? 0;

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

      resolveServerStreak(uid, serverData).then(resolved => {
        setStreak(resolved.count ?? 0);
        setStreakLastDate(resolved.lastDate ?? null);
        saveStreak(uid, resolved);
      });
    }).finally(() => {
      persistEnabled.current = true;
    });
  }, [uid]);

  // ── Persist state to localStorage + server (debounced) ────────────────────
  useEffect(() => {
    if (!persistEnabled.current) return;
    if (!uid) return;

    // Module 2: the sync engine already wrote this exact snapshot to both
    // localStorage and the server when it downloaded it — don't immediately
    // re-upload it right back (avoids the "unnecessary upload" this effect
    // would otherwise fire on the state changes the download just made).
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    // Stamp every save with the current ms timestamp so the hydration logic
    // above can compare freshness between localStorage and the server.
    const payload = {
      subjects, examDate, dailyHours, schedule, dayIdx, overflowCount,
      streak: { count: streak, lastDate: streakLastDate },
      savedAt: Date.now(),
    };

    // localStorage: always immediate (fast, synchronous)
    saveToStorage(uid, payload);

    // Server: debounced — the beforeunload flush handles the "refresh too fast"
    // edge case so we can keep a comfortable 2 s window here.
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushFullPlan(payload).then(result => {
        // Module 2: remember the version the server settled on so the next
        // sync-status check knows this upload already happened.
        if (result?.version !== undefined) serverVersionRef.current = result.version;
      });
      // Release the debounce guard as soon as the request is sent (not when
      // it resolves) — sync-status polling only needs to know a save isn't
      // about to overwrite it a moment later, not wait on the network.
      debounceRef.current = null;
    }, 2000);
  }, [uid, subjects, examDate, dailyHours, schedule, dayIdx, overflowCount, streak, streakLastDate]);

  // ── Module 2: automatic cross-device sync check ────────────────────────────
  // Asks the server "has anything changed since the version I last saw?"
  // On its own this is metadata-only (no plan payload moves). Only when the
  // server reports it's newer do we fetch and apply the full plan — i.e. a
  // stale local cache gets refreshed automatically without the user having
  // to reload the page. Last-write-wins remains the resolution strategy
  // (unchanged from Module 1); no merging happens here (Module 3).
  const checkSyncStatus = useCallback(async () => {
    if (!uid || !persistEnabled.current || isSyncingRef.current) return;

    // A local change is queued to upload — let that finish and become the
    // new server version instead of racing a download against it. This is
    // also what keeps offline edits intact: nothing here can overwrite
    // unsaved local changes.
    if (debounceRef.current) return;

    const status = await fetchSyncStatus(serverVersionRef.current);
    if (!status || !status.exists || !status.serverNewer) return;

    isSyncingRef.current = true;
    try {
      const serverData = await fetchFullPlan();
      if (serverData) {
        skipNextPersistRef.current = true;
        setSubjects(serverData.subjects      ?? []);
        setExamDate(serverData.examDate      ?? defaultExamDate());
        setDailyHours(serverData.dailyHours  ?? 4);
        setSchedule(serverData.schedule      ?? []);
        setDayIdx(serverData.dayIdx          ?? 0);
        setOverflowCount(serverData.overflowCount ?? 0);
        setStreak(serverData.streak?.count       ?? 0);
        setStreakLastDate(serverData.streak?.lastDate ?? null);

        // Update caches directly (mirrors the hydration-effect pattern) so
        // a refresh right after this still sees the newly-synced data.
        saveToStorage(uid, serverData);
        saveStreak(uid, serverData.streak ?? { count: 0, lastDate: null });

        serverVersionRef.current = serverData.version ?? serverVersionRef.current;
      }
    } catch {
      /* offline / network error — silent, preserves offline functionality */
    } finally {
      isSyncingRef.current = false;
    }
  }, [uid]);

  // Poll periodically and on tab refocus/visibility so multi-device changes
  // show up automatically without a manual reload. Debounced local saves and
  // the beforeunload flush (above) remain the only upload paths — this
  // effect only ever downloads.
  useEffect(() => {
    if (!uid) return;

    const POLL_MS = 20000;
    const interval = setInterval(checkSyncStatus, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkSyncStatus();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', checkSyncStatus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', checkSyncStatus);
    };
  }, [uid, checkSyncStatus]);

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
    setStreakLastDate(today);
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
      streak: { count: 0, lastDate: null },
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
      setStreakLastDate(null);
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