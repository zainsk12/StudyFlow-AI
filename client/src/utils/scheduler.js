// client/src/utils/scheduler.js

const DIFF_HRS   = { easy: 1, medium: 1.5, hard: 2.5 };
const DIFF_ORDER = { hard: 0, medium: 1,   easy: 2   };

/** Round to 1 decimal place */
function fmt(n) { return Math.round(n * 10) / 10; }

/**
 * Parses "YYYY-MM-DD" as local midnight (avoids UTC off-by-one for IST users).
 */
function localMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formats a Date as "YYYY-MM-DD" using local timezone components.
 * Using toISOString() converts to UTC first, which shifts the date back
 * by a day for timezones ahead of UTC (e.g. IST +5:30) at midnight.
 */
function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Compare calendar dates rather than elapsed milliseconds. Local-midnight
// intervals can be 23 or 25 hours when daylight saving time changes.
export function calendarDaysBetween(startDate, endDate) {
  const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((end - start) / 86_400_000);
}

/**
 * Days from today (local) until a "YYYY-MM-DD" date string.
 */
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = localMidnight(dateStr);
  return Math.max(0, calendarDaysBetween(today, exam));
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal core builder
// ─────────────────────────────────────────────────────────────────────────────
function buildScheduleFrom(subjects, startDate, examDate, dailyHours, skipTopicIds = new Set()) {
  const totalDays = Math.max(1, calendarDaysBetween(startDate, examDate));

  const queue = subjects
    .flatMap(s =>
      s.topics
        .filter(t => !skipTopicIds.has(t.id))
        .map(t => ({
          subjectId:   s.id,
          subjectName: s.name,
          color:       s.color,
          topicId:     t.id,
          topicName:   t.name,
          difficulty:  t.difficulty,
          hoursLeft:   DIFF_HRS[t.difficulty] ?? 1,
        }))
    )
    .sort((a, b) => DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]);

  const days = [];
  let qi = 0;

  for (let d = 0; d < totalDays && qi < queue.length; d++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + d);

    let remaining = dailyHours;
    const sessions = [];

    while (remaining >= 0.5 && qi < queue.length) {
      const topic = queue[qi];
      const take  = parseFloat(Math.min(remaining, topic.hoursLeft, 2).toFixed(1));

      sessions.push({
        subjectId:   topic.subjectId,
        subjectName: topic.subjectName,
        color:       topic.color,
        topicId:     topic.topicId,
        topicName:   topic.topicName,
        difficulty:  topic.difficulty,
        hours:       take,
      });

      topic.hoursLeft = parseFloat((topic.hoursLeft - take).toFixed(2));
      remaining       = parseFloat((remaining - take).toFixed(2));
      if (topic.hoursLeft <= 0.05) qi++;
    }

    if (sessions.length) {
      days.push({ date: localDateStr(date), sessions });
    }
  }

  const overflowCount = queue.slice(qi).length;
  return { days, overflowCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported: buildSchedule
// Builds a full schedule from today (first-time generate).
// ─────────────────────────────────────────────────────────────────────────────
export function buildSchedule(subjects, examDate, dailyHours) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = localMidnight(examDate);
  return buildScheduleFrom(subjects, today, exam, dailyHours);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported: buildScheduleFromToday
// Re-generates from today, skipping done topics (SmartRegen).
// ─────────────────────────────────────────────────────────────────────────────
export function buildScheduleFromToday(subjects, examDate, dailyHours) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = localMidnight(examDate);

  const doneIds = new Set(
    subjects.flatMap(s =>
      s.topics.filter(t => t.status === 'done').map(t => t.id)
    )
  );

  return buildScheduleFrom(subjects, today, exam, dailyHours, doneIds);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported: computeStats
// Returns ALL fields consumed by every component that reads `stats`:
//   Header, SetupTab, StatsTab, PlanFeasibilityModal, App.jsx
// ─────────────────────────────────────────────────────────────────────────────
export function computeStats(subjects, examDate, dailyHours) {
  const allTopics     = subjects.flatMap(s => s.topics);
  const doneTopics    = allTopics.filter(t => t.status === 'done').length;
  const totalTopics   = allTopics.length;
  const pendingTopics = totalTopics - doneTopics;
  const pct           = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;

  // Total hours still needed (pending topics only)
  const totalHours = fmt(
    subjects.reduce(
      (a, s) => a + s.topics
        .filter(t => t.status !== 'done')
        .reduce((b, t) => b + (DIFF_HRS[t.difficulty] ?? 1), 0),
      0
    )
  );

  const daysLeft           = daysUntil(examDate);
  const availableHours     = fmt(daysLeft * (dailyHours || 0));
  const feasible           = availableHours >= totalHours;
  const requiredDailyHours = daysLeft > 0 ? fmt(totalHours / daysLeft) : null;
  const hoursShortfall     = fmt(Math.max(0, totalHours - availableHours));

  // ── Pie chart: pending study hours per subject ────────────────────────────
  const pieData = subjects
    .map(s => ({
      name:  s.name || 'Unnamed',
      value: fmt(
        s.topics
          .filter(t => t.status !== 'done')
          .reduce((a, t) => a + (DIFF_HRS[t.difficulty] ?? 1), 0)
      ),
      color: s.color || '#9333ea',
    }))
    .filter(e => e.value > 0);

  // ── Bar chart: topics Done vs Pending per subject ─────────────────────────
  // FIX: StatsTab BarChart uses dataKey="Done" and dataKey="Pending".
  // The old barData shape { name, hours, color } didn't have those keys,
  // so the chart rendered completely blank. Now each entry has the correct
  // Done / Pending numeric counts that the BarChart can read.
  const barData = subjects.map(s => {
    const done    = s.topics.filter(t => t.status === 'done').length;
    const pending = s.topics.length - done;
    return {
      name:    s.name || 'Unnamed',
      Done:    done,
      Pending: pending,
      color:   s.color || '#9333ea',
    };
  });

  return {
    totalTopics,
    doneTopics,
    pendingTopics,
    pct,
    totalHours,
    daysLeft,
    availableHours,
    feasible,
    requiredDailyHours,
    hoursShortfall,
    pieData,
    barData,
  };
}
