// pdf-parse is a Node.js-native PDF text extractor.
// It requires zero browser polyfills and zero worker configuration —
// unlike pdfjs-dist v5 which throws "Setting up fake worker failed:
// No GlobalWorkerOptions.workerSrc specified" in Node.js environments.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

// ── PDF text extraction ────────────────────────────────────────────────────
async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  return data.text?.trim() ?? '';
}

// ── Attempt to repair truncated JSON ──────────────────────────────────────
function repairTruncatedJSON(raw) {
  const startIdx = raw.indexOf('[');
  if (startIdx === -1) return null;

  let json = raw.slice(startIdx);

  json = json
    .replace(/,\s*\{\s*"name"\s*:\s*"[^"]*"\s*$/, '')
    .replace(/,\s*\{\s*"name"\s*:\s*$/, '')
    .replace(/,\s*\{\s*$/, '')
    .replace(/,\s*"[^"]*"\s*:\s*"[^"]*"\s*$/, '')
    .replace(/,\s*"[^"]*"\s*:\s*$/, '')
    .trim();

  const stack = [];
  for (const ch of json) {
    if (ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ']' || ch === '}') stack.pop();
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    json += stack[i] === '[' ? ']' : '}';
  }

  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── Call Mistral AI — with retry logic & improved error handling ───────────
async function extractWithMistral(text, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;

    try {
      response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model:       'mistral-small-latest',
          temperature: 0.1,
          max_tokens:  16000,
          messages: [
            {
              role: 'system',
              content: `You are a precise syllabus parser AND difficulty classifier. Extract ALL subjects and ALL their topics from the syllabus, and classify each topic's difficulty based on its name and academic context.

DIFFICULTY CLASSIFICATION — apply these rules carefully to every topic:
- "easy"   → Introductory / definitional / recall topics. Examples: "Introduction to X", "Basic Concepts", "History of Y", "Definitions & Terminology", "Overview", "Types of Z" (simple listing).
- "medium" → Standard topics requiring understanding and application. Examples: "Working of X", "Applications of Y", "Standard algorithms", "Core theorems", "Problem-solving in Z", most typical syllabus content.
- "hard"   → Complex derivations, advanced algorithms, multi-concept integration, proofs, design, optimization. Examples: "Derivation of X", "Advanced Y", "Complexity Analysis", "Proof of Z", "Design and Implementation", "Optimization techniques", any topic containing words like "advanced", "complex", "derive", "proof", "analysis", "design".

EXTRACTION RULES:
- Extract EVERY single topic — never skip, summarize, or group topics together
- Each bullet point, numbered item, or sub-item = one separate topic
- Keep topic names exactly as written in the syllabus
- Return ONLY a raw JSON array — no markdown, no explanation, no code fences
- Make sure the JSON is complete and properly closed before finishing

Format:
[
  {
    "name": "Subject Name",
    "topics": [
      { "name": "Exact Topic Name", "difficulty": "easy|medium|hard" }
    ]
  }
]`,
            },
            {
              role: 'user',
              content: `Extract ALL subjects and every single topic from this syllabus:\n\n${text}`,
            },
          ],
        }),
      });
    } catch (networkErr) {
      console.error(`Attempt ${attempt + 1} network error:`, networkErr.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw new Error(`Network error reaching Mistral API: ${networkErr.message}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`Attempt ${attempt + 1} — Mistral raw error (${response.status}):`, errText);

      let errMsg = `Mistral API error: ${response.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson?.message || errJson?.error?.message || errMsg;
      } catch {}

      const retryableStatuses = [520, 529, 503, 502];
      if (retryableStatuses.includes(response.status) && attempt < retries) {
        console.warn(`Retrying after ${response.status}... (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid or unauthorized Mistral API key. Please check your MISTRAL_API_KEY.');
      }
      if (response.status === 429) {
        throw new Error('Mistral API rate limit exceeded. Please wait a moment and try again.');
      }

      throw new Error(errMsg);
    }

    const data       = await response.json();
    const raw        = data.choices?.[0]?.message?.content?.trim() ?? '';
    const stopReason = data.choices?.[0]?.finish_reason;

    console.log(`Mistral finish_reason: ${stopReason}, response length: ${raw.length}`);

    const clean = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    try {
      const match  = clean.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(match ? match[0] : clean);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`✅ Clean JSON parse succeeded: ${parsed.length} subjects`);
        return parsed;
      }
    } catch (parseErr) {
      console.warn('Normal JSON parse failed, attempting repair...', parseErr.message);
    }

    if (stopReason === 'length' || stopReason === null) {
      console.warn('Response may be truncated, attempting JSON repair...');
      const repaired = repairTruncatedJSON(clean);
      if (repaired && repaired.length > 0) {
        console.log(`✅ Repaired truncated JSON: ${repaired.length} subjects`);
        return repaired;
      }
    }

    if (attempt < retries) {
      console.warn(`JSON parse/repair failed on attempt ${attempt + 1}, retrying...`);
      continue;
    }

    throw new Error('AI returned malformed JSON that could not be repaired. Please try again.');
  }
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

    send({ type: 'status', message: 'AI is analyzing your full syllabus…', progress: 35 });

    // Fix 7: warn user when PDF is truncated so they know content may be missing
    if (text.length > 80000) {
      send({ type: 'warning', message: 'PDF is large — content beyond 80,000 characters was trimmed and may be missing from the results.' });
    }
    const inputText = text.length > 80000 ? text.slice(0, 80000) : text;

    send({ type: 'status', message: 'Extracting all subjects and topics…', progress: 60 });

    let rawSubjects;
    try {
      rawSubjects = await extractWithMistral(inputText);
    } catch (err) {
      console.error('Mistral AI error:', err.message);
      send({ type: 'error', message: err.message });
      return res.end();
    }

    send({ type: 'status', message: 'Finalizing results…', progress: 90 });

    const subjects    = cleanSubjects(rawSubjects);
    const totalTopics = subjects.reduce((a, s) => a + s.topics.length, 0);

    if (!subjects.length) {
      send({ type: 'error', message: 'No subjects found. Make sure the PDF contains a readable syllabus.' });
      return res.end();
    }

    console.log(`✅ Mistral extracted: ${subjects.length} subjects, ${totalTopics} topics`);

    send({ type: 'done', subjects, progress: 100 });
    res.end();

  } catch (error) {
    console.error('Syllabus import error:', error);
    send({ type: 'error', message: error.message || 'Failed to process PDF' });
    res.end();
  }
};