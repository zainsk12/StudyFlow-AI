// pdf-parse is a Node.js-native PDF text extractor.
// It requires zero browser polyfills and zero worker configuration —
// unlike pdfjs-dist v5 which throws "Setting up fake worker failed:
// No GlobalWorkerOptions.workerSrc specified" in Node.js environments.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// ── PDF text extraction ────────────────────────────────────────────────────
async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text?.trim() ?? '';
}

// ── Extract syllabus topics with Gemini's constrained JSON output ──────────
const SYLLABUS_SYSTEM_PROMPT = `You are a precise syllabus parser and difficulty classifier. Extract every subject and every topic from the syllabus. Each bullet, numbered item, or sub-item is a separate topic. Preserve topic names as written. Classify introductory or definitional topics as easy, standard applied topics as medium, and advanced proofs, derivations, design, optimization, or analysis as hard. Do not summarize or omit topics. Return all extracted data in the required JSON schema.`;

const SYLLABUS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          topics: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
              },
              required: ['name', 'difficulty'],
            },
          },
        },
        required: ['name', 'topics'],
      },
    },
  },
  required: ['subjects'],
};

async function extractWithGemini(text, onRetry) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing. Create a free Gemini API key and add it to server/.env.');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYLLABUS_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: `Extract all subjects and topics from this syllabus:\n\n${text}` }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 20000,
            responseFormat: {
              text: {
                mimeType: 'APPLICATION_JSON',
                schema: SYLLABUS_RESPONSE_SCHEMA,
              },
            },
          },
        }),
      });
    } catch (error) {
      if (attempt === 2) throw new Error(`Could not connect to Gemini: ${error.message}`);
      const waitMs = 1_000 * (attempt + 1);
      onRetry?.(waitMs);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || `Gemini API error (${response.status})`;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const waitMs = 2_000 * (attempt + 1);
        onRetry?.(waitMs);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const content = payload.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('') || '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Gemini returned incomplete syllabus data. Try a clearer or smaller PDF.');
    }
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.subjects)) return parsed.subjects;
    throw new Error('Gemini returned an unexpected syllabus format.');
  }
  throw new Error('Gemini could not process this syllabus. Please try again.');
}

// ── Validate and clean extracted subjects ──────────────────────────────────
function cleanSubjects(raw) {
  return raw
    .filter(s => s?.name && Array.isArray(s.topics) && s.topics.length > 0)
    .map(s => ({
      name:   s.name.trim(),
      topics: s.topics
        .filter(t => t?.name)
        .map(t => ({
          name:       t.name.trim(),
          difficulty: ['easy', 'medium', 'hard'].includes(t.difficulty)
            ? t.difficulty
            : 'medium',
        })),
    }));
}

// ── SSE streaming controller ───────────────────────────────────────────────
export const importSyllabus = async (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    if (!req.file) {
      send({ type: 'error', message: 'No PDF file uploaded' });
      return res.end();
    }

    send({ type: 'status', message: 'Reading PDF…', progress: 10 });

    const text = await extractTextFromPDF(req.file.buffer);

    if (!text || text.length < 50) {
      send({ type: 'error', message: 'Could not extract text. Make sure it is not a scanned image PDF.' });
      return res.end();
    }

    send({ type: 'status', message: 'Gemini is analyzing your syllabus…', progress: 35 });

    // Fix 7: warn user when PDF is truncated so they know content may be missing
    if (text.length > 80000) {
      send({ type: 'warning', message: 'PDF is large — content beyond 80,000 characters was trimmed and may be missing from the results.' });
    }
    const inputText = text.length > 80000 ? text.slice(0, 80000) : text;

    const rawSubjects = await extractWithGemini(inputText, (waitMs) => {
      send({
        type: 'status',
        message: `Gemini is busy. Retrying in about ${Math.ceil(waitMs / 1000)} seconds…`,
        progress: 60,
      });
    });

    send({ type: 'status', message: 'Finalizing results…', progress: 90 });

    const subjects    = cleanSubjects(rawSubjects);
    const totalTopics = subjects.reduce((a, s) => a + s.topics.length, 0);

    if (!subjects.length) {
      send({ type: 'error', message: 'No subjects found. Make sure the PDF contains a readable syllabus.' });
      return res.end();
    }

    console.log(`✅ Gemini extracted: ${subjects.length} subjects, ${totalTopics} topics`);

    send({ type: 'done', subjects, progress: 100 });
    res.end();

  } catch (error) {
    console.error('Syllabus import error:', error);
    const message = error.status === 429
      ? 'Gemini is temporarily rate-limiting requests for this API key. Wait a little and try again.'
      : error.status === 401 || error.status === 403
        ? 'Gemini rejected the API key. Check GEMINI_API_KEY in server/.env.'
        : error.message || 'Failed to process PDF';
    send({ type: 'error', message });
    res.end();
  }
};
