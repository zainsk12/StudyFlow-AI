import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// llama-3.3-70b-versatile was retired for developer-tier accounts. Keep the
// model configurable so provider catalog changes don't require code edits.
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const MAX_CHAT_MESSAGES  = 20;
const MAX_MESSAGE_CHARS  = 4000;

function summarizeSubjects(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) return 'No subjects loaded yet.';
  return subjects
    .map(s => {
      const total = s.topics?.length ?? 0;
      const done  = s.topics?.filter(t => t.status === 'done')?.length ?? 0;
      return `${s.name}: ${done}/${total} topics done`;
    })
    .join(', ');
}

function safeInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export const chatWithAI = async (req, res) => {
  try {
    const { message, messages, subjects, examDate, dailyHours, stats } = req.body;

    let groqMessages;

    if (typeof message === 'string') {
      groqMessages = [{ role: 'user', content: String(message).slice(0, MAX_MESSAGE_CHARS) }];
    } else if (Array.isArray(messages) && messages.length > 0) {
      groqMessages = messages
        .filter(m => m && (m.content || m.text))
        .map(m => ({
          role:    m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content ?? m.text ?? '').slice(0, MAX_MESSAGE_CHARS),
        }))
        .slice(-MAX_CHAT_MESSAGES);
    } else {
      return res.status(400).json({ message: 'No message provided.' });
    }

    const systemPrompt = `You are an AI study coach for StudyFlow AI.
You know the student's full study plan:
- Exam date: ${examDate ?? 'not set'}
- Daily study hours: ${dailyHours ?? 'not set'}
- Overall progress: ${stats?.pct ?? 0}%
- Subjects: ${summarizeSubjects(subjects)}

Give helpful, personalised, concise study advice. Be encouraging and practical.
Format responses with standard Markdown (headings, lists, emphasis, and tables only when useful).
Finish every response with a complete thought; avoid overly long plans and keep most answers under 400 words.`;

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...groqMessages,
      ],
      max_tokens: 1800,
    });

    const reply = completion.choices?.[0]?.message?.content
      ?? 'Sorry, I could not generate a response. Please try again.';

    res.json({ reply });
  } catch (error) {
    console.error('AI ERROR:', error);
    res.status(500).json({ message: 'AI request failed. Please try again.' });
  }
};

export const regenAdvice = async (req, res) => {
  try {
    const { behindCount, daysLeft, doneTopics, totalTopics } = req.body;

    const fields = { behindCount, daysLeft, doneTopics, totalTopics };
    for (const [key, val] of Object.entries(fields)) {
      if (val === undefined || val === null || !Number.isFinite(Number(val))) {
        return res.status(400).json({ message: `\`${key}\` must be a finite number.` });
      }
    }

    const safeBehind = safeInt(behindCount, 0, 10_000);
    const safeDays   = safeInt(daysLeft,    0, 3_650);
    const safeDone   = safeInt(doneTopics,  0, 100_000);
    const safeTotal  = safeInt(totalTopics, 1, 100_000);

    if (safeDone > safeTotal) {
      return res.status(400).json({ message: '`doneTopics` cannot exceed `totalTopics`.' });
    }

    const pct = Math.round((safeDone / safeTotal) * 100);

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a motivating AI study coach. Keep responses under 2 sentences. Be direct, encouraging, and practical.' },
        { role: 'user',   content: `I am ${safeBehind} topic(s) behind. I've done ${safeDone}/${safeTotal} topics (${pct}%) with ${safeDays} days left. Schedule regenerated. Give a brief motivating message and one tip.` },
      ],
      model:      GROQ_MODEL,
      max_tokens: 120,
    });

    const advice = completion.choices?.[0]?.message?.content ?? '';
    res.json({ advice });
  } catch (error) {
    console.error('Regen advice error:', error);
    res.status(500).json({ advice: '' });
  }
};
