// /api/generate.js — Vercel serverless function
// Hides the Groq API key server-side. Set GROQ_API_KEY in your Vercel
// project's Environment Variables (Settings → Environment Variables).

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_INPUT_CHARS = 12000; // server-side safety net, independent of client limit
const MAX_BRANCHES = 7;
const MAX_CHILDREN = 5;
const MAX_GRANDCHILDREN = 4;

const SYSTEM_PROMPT = `You are a mind map generator for ThunderStudy, used by Indian competitive exam students (CUET, SSC, Banking, JEE/NEET).
Given a topic or block of study text, produce a clear, exam-useful mind map.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:
{
  "title": "short title for the whole map",
  "branches": [
    {
      "label": "main branch label",
      "children": [
        {
          "label": "sub-topic label",
          "children": [
            { "label": "key fact / term / example" }
          ]
        }
      ]
    }
  ]
}

Rules:
- Maximum 7 branches.
- Maximum 5 children per branch.
- Maximum 4 grandchildren per child.
- Labels must be short (under 6 words), exam-relevant, and in plain English (or Hindi if the input is in Hindi).
- Do not invent facts that contradict the given text; if given only a topic name, use accurate general knowledge.
- Children/grandchildren arrays may be shorter than the max, or omitted, if the topic doesn't need that depth.`;

function clampMindMap(data) {
  if (!data || typeof data !== 'object') return null;
  if (!data.title || !Array.isArray(data.branches)) return null;
  data.branches = data.branches.slice(0, MAX_BRANCHES).map((b) => {
    const branch = { label: String(b.label || '').slice(0, 80), children: [] };
    if (Array.isArray(b.children)) {
      branch.children = b.children.slice(0, MAX_CHILDREN).map((c) => {
        const child = { label: String(c.label || '').slice(0, 70), children: [] };
        if (Array.isArray(c.children)) {
          child.children = c.children.slice(0, MAX_GRANDCHILDREN).map((g) => ({
            label: String(g.label || '').slice(0, 60)
          }));
        }
        return child;
      });
    }
    return branch;
  });
  data.title = String(data.title).slice(0, 90);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is not configured with a Groq API key.' });
    return;
  }

  const { mode, input } = req.body || {};
  if (!input || typeof input !== 'string' || !input.trim()) {
    res.status(400).json({ error: 'Missing input.' });
    return;
  }
  const safeInput = input.slice(0, MAX_INPUT_CHARS);

  const userPrompt = mode === 'topic'
    ? `Create a mind map for this topic: "${safeInput}"`
    : `Create a mind map summarising the key points of the following study text:\n\n${safeInput}`;

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.4,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq error:', groqRes.status, errText);
      res.status(502).json({ error: 'AI provider error.' });
      return;
    }

    const completion = await groqRes.json();
    const raw = completion.choices?.[0]?.message?.content || '';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      res.status(502).json({ error: 'AI returned malformed JSON.' });
      return;
    }

    const clamped = clampMindMap(parsed);
    if (!clamped) {
      res.status(502).json({ error: 'AI response did not match the expected shape.' });
      return;
    }

    res.status(200).json(clamped);
  } catch (err) {
    console.error('Generate handler error:', err);
    res.status(500).json({ error: 'Unexpected server error.' });
  }
}
