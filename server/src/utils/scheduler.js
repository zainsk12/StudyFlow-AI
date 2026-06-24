const DIFF_HRS   = { easy: 1, medium: 1.5, hard: 2.5 };
const DIFF_ORDER = { hard: 0, medium: 1,   easy: 2   };

/**
 * Builds a day-by-day schedule from subjects, exam date, and daily hours.
 *
 * @param {Array}  subjects   - Subject[] with nested topics
 * @param {string} examDate   - ISO date string "YYYY-MM-DD"
 * @param {number} dailyHours - Study hours available per day
 * @returns {Array} days      - [{ date, sessions: [] }]
 */
export function buildSchedule(subjects, examDate, dailyHours) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exam      = new Date(examDate);
  const totalDays = Math.max(1, Math.floor((exam - today) / 86_400_000));

  const queue = subjects
    .flatMap(s =>
      s.topics.map(t => ({
        subjectId:   s.id,
        subjectName: s.name,
        color:       s.color,
        topicId:     t.id,
        topicName:   t.name,
        difficulty:  t.difficulty,
        hoursLeft:   DIFF_HRS[t.difficulty],
      }))
    )
    .sort((a, b) => DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]);

  const days = [];
  let qi = 0;

  for (let d = 0; d < totalDays && qi < queue.length; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);

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
      remaining       = parseFloat((remaining       - take).toFixed(2));
      if (topic.hoursLeft <= 0.05) qi++;
    }

    if (sessions.length) {
      days.push({ date: date.toISOString().split('T')[0], sessions });
    }
  }

  return days;
}
