// client/src/App.jsx
import { useState, useEffect }  from 'react';
import { useAuth }              from './context/AuthContext';
import LoginPage                from './pages/LoginPage';
import SignupPage               from './pages/SignupPage';
import Header                   from './components/Header/Header';
import SetupTab                 from './components/Setup/SetupTab';
import ScheduleTab              from './components/Schedule/ScheduleTab';
import ProgressTab              from './components/Progress/ProgressTab';
import StatsTab                 from './components/Stats/StatsTab';
import AICoachTab               from './components/AICoach/AICoachTab';
import ClearDataModal           from './components/common/ClearDataModal';
import PlanFeasibilityModal     from './components/Setup/PlanFeasibilityModal';
import { FOCUS_SEC, BREAK_SEC } from './components/Schedule/PomodoroTimer';
import { useStudyPlanner }      from './hooks/useStudyPlanner';
import { AI_WELCOME }           from './constants';
import './styles/global.css';

function localTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function App() {
  const { user, loading } = useAuth();
  const [authPage,        setAuthPage]        = useState('login');
  const [tab,             setTab]             = useState('setup');
  const [clearModalInfo,  setClearModalInfo]  = useState(null);
  const [showFeasibility, setShowFeasibility] = useState(false);

  const [dismissedKeys, setDismissedKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sf_dismissed') || '[]'); }
    catch { return []; }
  });

  const [chatMessages, setChatMessages] = useState([{ role: 'assistant', text: AI_WELCOME }]);
  useEffect(() => {
    if (!user) setChatMessages([{ role: 'assistant', text: AI_WELCOME }]);
  }, [user]);

  // ── 🍅 Pomodoro — lifted so the timer never resets on tab switch ────────
  const [pomoPhase,     setPomoPhase]     = useState('idle');
  const [pomoFocusLeft, setPomoFocusLeft] = useState(FOCUS_SEC);
  const [pomoBreakLeft, setPomoBreakLeft] = useState(BREAK_SEC);
  const [pomoSessions,  setPomoSessions]  = useState(0);

  // ── Study planner ───────────────────────────────────────────────────────
  const planner = useStudyPlanner(user?._id);
  const {
    subjects, examDate, dailyHours, schedule, dayIdx, stats,
    behindCount, overflowCount,
    lastAddedSubjectId, lastAddedTopicId,
    setExamDate, setDailyHours, setDayIdx,
    generatePlan, regeneratePlan, toggleTopic,
    addSubject, removeSubject, updateSubject,
    addTopic,   removeTopic,   updateTopic,
    importSubjects, clearAll, unmarkAll,
    streak,
  } = planner;

  // Current topic shown inside the Pomodoro timer
  const currentTopicName = schedule[dayIdx]?.sessions?.[0]?.topicName ?? null;

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleGenerate       = () => { generatePlan(); setTab('schedule'); };
  const handleGenerateNew    = () => { setShowFeasibility(false); generatePlan(); setTab('schedule'); };
  const handleGenerateAnyway = () => { setShowFeasibility(false); generatePlan(); setTab('schedule'); };
  const openFeasibility      = () => setShowFeasibility(true);

  useEffect(() => {
    if (!subjects.length) return;
    const todayStr   = localTodayStr();
    const examPassed = examDate && examDate < todayStr;
    const allDone    = stats.pct === 100 && stats.totalTopics > 0;
    const examKey    = `exam_over_${examDate}`;
    const doneKey    = `all_done_${stats.totalTopics}`;
    if (examPassed && !dismissedKeys.includes(examKey)) {
      setClearModalInfo({ reason: 'exam_over', examDate });
    } else if (allDone && !dismissedKeys.includes(doneKey)) {
      setClearModalInfo({ reason: 'all_done', examDate });
    }
  }, [stats.pct, examDate, subjects.length, dismissedKeys]);

  const handleClearConfirm = () => { clearAll(); setClearModalInfo(null); setTab('setup'); };
  const handleClearDismiss = () => {
    if (!clearModalInfo) return;
    const key = clearModalInfo.reason === 'exam_over'
      ? `exam_over_${examDate}` : `all_done_${stats.totalTopics}`;
    const updated = [...dismissedKeys, key];
    setDismissedKeys(updated);
    localStorage.setItem('sf_dismissed', JSON.stringify(updated));
    setClearModalInfo(null);
  };

  // Keyboard shortcuts: 1-5 switch tabs, Escape closes modals
useEffect(() => {
  const TABS_ORDER = ['setup', 'schedule', 'progress', 'stats', 'ai'];
  const handler = (e) => {
    // Skip if user is typing in an input/textarea
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'Escape') {
      if (clearModalInfo) setClearModalInfo(null);
      if (showFeasibility) setShowFeasibility(false);
    }
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 5 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setTab(TABS_ORDER[num - 1]);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [clearModalInfo, showFeasibility]);

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:'#475569', fontSize:14 }}>Loading…</div>
    </div>
  );

  if (!user) {
    return authPage === 'login'
      ? <LoginPage  onSwitch={() => setAuthPage('signup')} />
      : <SignupPage onSwitch={() => setAuthPage('login')}  />;
  }

  return (
    <div style={{
      fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif",
      background: '#0d1117', minHeight: '100vh', color: '#e2e8f0',
    }}>
      {/*
        Header owns the Pomodoro pill (dropdown) and the user avatar (dropdown).
        All timer state is lifted here so it survives tab switches.
        subjects + examDate are passed so ProfileModal can show study overview.
      */}
      <Header
        tab={tab} setTab={setTab}
        stats={stats} dailyHours={dailyHours}
        pomoPhase={pomoPhase}         setPomoPhase={setPomoPhase}
        pomoFocusLeft={pomoFocusLeft} setPomoFocusLeft={setPomoFocusLeft}
        pomoBreakLeft={pomoBreakLeft} setPomoBreakLeft={setPomoBreakLeft}
        pomoSessions={pomoSessions}   setPomoSessions={setPomoSessions}
        currentTopicName={currentTopicName}
        subjects={subjects}
        examDate={examDate}
      />

      {/* Single-column content — full 960 px restored */}
      <div className="sf-content" style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 48px' }}>

        {streak > 0 && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 20, padding: '4px 14px', fontSize: 13, color: '#f59e0b',
            }}>
              🔥 {streak}-day study streak
            </span>
          </div>
        )}

        {tab === 'setup' && (
          <SetupTab
            subjects={subjects} examDate={examDate} dailyHours={dailyHours} stats={stats}
            overflowCount={overflowCount}
            lastAddedSubjectId={lastAddedSubjectId} lastAddedTopicId={lastAddedTopicId}
            setExamDate={setExamDate} setDailyHours={setDailyHours}
            addSubject={addSubject}   removeSubject={removeSubject}   updateSubject={updateSubject}
            addTopic={addTopic}       removeTopic={removeTopic}       updateTopic={updateTopic}
            onImportSubjects={importSubjects}
            isPro={!!user?.isPro}
            hasSchedule={schedule.length > 0}
            onGenerate={handleGenerate}
            onOpenFeasibility={openFeasibility}
            onClearAll={() => setClearModalInfo({
              reason: stats.pct === 100 ? 'all_done' : stats.daysLeft === 0 ? 'exam_over' : 'manual',
              examDate,
            })}
          />
        )}

        {tab === 'schedule' && (
          <ScheduleTab
            schedule={schedule} dayIdx={dayIdx} setDayIdx={setDayIdx}
            onGoSetup={() => setTab('setup')}
            behindCount={behindCount}
            daysLeft={stats.daysLeft}
            doneTopics={stats.doneTopics}
            totalTopics={stats.totalTopics}
            onRegenerate={regeneratePlan}
            subjects={subjects} examDate={examDate}
            dailyHours={dailyHours} stats={stats}
          />
        )}

        {tab === 'progress' && (
          <ProgressTab
            subjects={subjects} stats={stats}
            toggleTopic={toggleTopic} schedule={schedule}
            onUnmarkAll={unmarkAll}
            onRegenerate={overflowCount > 0
              ? openFeasibility
              : () => { regeneratePlan(); setTab('schedule'); }}
          />
        )}

        {tab === 'stats' && (
          <StatsTab subjects={subjects} stats={stats} dailyHours={dailyHours} />
        )}

        {tab === 'ai' && (
          <AICoachTab
            subjects={subjects} stats={stats}
            examDate={examDate} dailyHours={dailyHours}
            messages={chatMessages} setMessages={setChatMessages}
          />
        )}
      </div>

      {clearModalInfo && (
        <ClearDataModal
          reason={clearModalInfo.reason} examDate={examDate} pct={stats.pct}
          onConfirm={handleClearConfirm} onDismiss={handleClearDismiss}
        />
      )}

      {showFeasibility && (
        <PlanFeasibilityModal
          subjects={subjects} examDate={examDate}
          dailyHours={dailyHours} overflowCount={overflowCount}
          onSetDailyHours={setDailyHours} onSetExamDate={setExamDate}
          onRemoveTopic={removeTopic}
          onGenerateNew={handleGenerateNew} onGenerateAnyway={handleGenerateAnyway}
          onClose={() => setShowFeasibility(false)}
        />
      )}
    </div>
  );
}