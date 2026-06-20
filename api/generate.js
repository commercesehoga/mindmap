// /api/generate.js — Vercel serverless function
// Hides the Groq API key server-side. Set GROQ_API_KEY in your Vercel
// project's Environment Variables (Settings → Environment Variables).
//
// RATE LIMITING NOTE:
// This uses a local JSON file (./api/_ratelimit-data.json) as the counter
// store, per your request to avoid any Vercel-specific storage product.
// Be aware: Vercel serverless functions run on ephemeral, sometimes
// multi-instance containers — the filesystem is NOT guaranteed to persist
// between invocations or be shared across instances. On Vercel this acts
// as a soft speed bump (it mostly works against bursts hitting the same
// warm instance) rather than a hard cross-device guarantee, and it costs
// nothing extra to run. It works as a real, reliable limiter if you ever
// deploy this on a traditional always-on Node server with persistent disk.
// If you want a hard guarantee on Vercel specifically, that requires an
// external HTTP-reachable store — say the word and I'll wire it in.

import fs from 'fs';
import path from 'path';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_INPUT_CHARS = 12000; // server-side safety net, independent of client limit
const MAX_BRANCHES = 7;
const MAX_CHILDREN = 5;
const MAX_GRANDCHILDREN = 4;

const SERVER_DAILY_LIMIT = 8;   // looser than client's 3 — this is a backstop, not the primary gate
const SERVER_WEEKLY_LIMIT = 30; // looser than client's 12, same reasoning
const RATE_FILE = path.join(process.cwd(), 'api', '_ratelimit-data.json');

/* ---------- depth presets ---------- */
const DEPTH_RULES = {
  quick: {
    label: 'quick overview',
    maxChildren: 4,
    maxGrand: 0,
    instructions: 'Produce only 2 levels: branches and one layer of children. Do NOT include grandchildren — omit the innermost "children" array on sub-topics entirely. Keep it scannable for a 5-minute revision pass.'
  },
  deep: {
    label: 'deep dive',
    maxChildren: 5,
    maxGrand: 4,
    instructions: 'Produce the full 3 levels: branches, children, and grandchildren, with as much exam-relevant granularity as the topic supports.'
  }
};

function detailSchemaBlock() {
  return `Every node (root title aside) — every branch, child, and grandchild — must also include a "detail" field: a short, exam-useful paragraph (2-4 sentences) explaining that specific node in plain language. This is shown when a student taps the node and is also used to generate a one-topic-per-page study booklet, so it must stand alone without needing the rest of the map for context.`;
}

function buildSystemPrompt(depthKey) {
  const depth = DEPTH_RULES[depthKey] || DEPTH_RULES.deep;
  return `You are a mind map generator for ThunderStudy, used by Indian competitive exam students (CUET, SSC, Banking, JEE/NEET).
Given a topic or block of study text, produce a clear, exam-useful mind map.

Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:
{
  "title": "short title for the whole map",
  "branches": [
    {
      "label": "main branch label",
      "detail": "2-4 sentence standalone explanation of this branch",
      "children": [
        {
          "label": "sub-topic label",
          "detail": "2-4 sentence standalone explanation of this sub-topic",
          "children": [
            { "label": "key fact / term / example", "detail": "2-4 sentence standalone explanation" }
          ]
        }
      ]
    }
  ]
}

Depth mode: ${depth.label}. ${depth.instructions}

Rules:
- Maximum 7 branches.
- Maximum ${depth.maxChildren} children per branch.
- Maximum ${depth.maxGrand} grandchildren per child.
- Labels must be short (under 6 words), exam-relevant, and in plain English (or Hindi if the input is in Hindi).
- ${detailSchemaBlock()}
- Do not invent facts that contradict the given text; if given only a topic name, use accurate general knowledge.
- Children/grandchildren arrays may be shorter than the max, or omitted, if the topic doesn't need that depth.
- Output strictly valid JSON. No trailing commas. No comments. Every string properly escaped and quoted.`;
}

const STRICT_RETRY_SUFFIX = `

IMPORTANT — YOUR PREVIOUS OUTPUT FAILED JSON.parse(). On this attempt:
- Output ONLY the raw JSON object. No markdown code fences (no \`\`\`), no leading/trailing text.
- Double-check every quote, comma, and brace is balanced before answering.
- Do not use single quotes for JSON strings — only double quotes.`;

function clampMindMap(data, depthKey) {
  if (!data || typeof data !== 'object') return null;
  if (!data.title || !Array.isArray(data.branches)) return null;
  const depth = DEPTH_RULES[depthKey] || DEPTH_RULES.deep;
  const cleanDetail = (s) => String(s || '').slice(0, 500);

  data.branches = data.branches.slice(0, MAX_BRANCHES).map((b) => {
    const branch = { label: String(b.label || '').slice(0, 80), detail: cleanDetail(b.detail), children: [] };
    if (Array.isArray(b.children)) {
      branch.children = b.children.slice(0, Math.min(MAX_CHILDREN, depth.maxChildren)).map((c) => {
        const child = { label: String(c.label || '').slice(0, 70), detail: cleanDetail(c.detail), children: [] };
        if (depth.maxGrand > 0 && Array.isArray(c.children)) {
          child.children = c.children.slice(0, Math.min(MAX_GRANDCHILDREN, depth.maxGrand)).map((g) => ({
            label: String(g.label || '').slice(0, 60),
            detail: cleanDetail(g.detail)
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

/* ---------- local-file rate limiting (see note above re: Vercel ephemerality) ---------- */
function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekKey() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}
function readRateData() {
  try {
    const raw = fs.readFileSync(RATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}
function writeRateData(data) {
  try {
    fs.writeFileSync(RATE_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {
    // Read-only filesystem (common on serverless) — fail open rather than 500ing real users.
    console.warn('Rate limit file not writable, skipping persistence:', e.message);
  }
}
function getClientKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress) || 'unknown';
  return ip;
}
function checkAndBumpRateLimit(req) {
  const key = getClientKey(req);
  const data = readRateData();
  const today = todayStr();
  const wk = weekKey();

  if (!data[key]) data[key] = { day: today, dayCount: 0, week: wk, weekCount: 0 };
  const entry = data[key];
  if (entry.day !== today) { entry.day = today; entry.dayCount = 0; }
  if (entry.week !== wk) { entry.week = wk; entry.weekCount = 0; }

  if (entry.dayCount >= SERVER_DAILY_LIMIT || entry.weekCount >= SERVER_WEEKLY_LIMIT) {
    return { allowed: false };
  }
  entry.dayCount += 1;
  entry.weekCount += 1;
  data[key] = entry;
  writeRateData(data);
  return { allowed: true };
}

/* ---------- Groq call helper (used by both full-map and single-branch modes) ---------- */
async function callGroq(apiKey, systemPrompt, userPrompt) {
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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });
  if (!groqRes.ok) {
    const errText = await groqRes.text();
    console.error('Groq error:', groqRes.status, errText);
    throw new Error('AI provider error.');
  }
  const completion = await groqRes.json();
  return completion.choices?.[0]?.message?.content || '';
}

async function getJsonFromGroq(apiKey, systemPrompt, userPrompt) {
  // First attempt
  let raw = await callGroq(apiKey, systemPrompt, userPrompt);
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Auto-retry once with a stricter system prompt instead of failing immediately
    console.warn('First Groq response was malformed JSON, retrying with stricter prompt.');
    raw = await callGroq(apiKey, systemPrompt + STRICT_RETRY_SUFFIX, userPrompt);
    return JSON.parse(raw); // let this throw if it fails again — caller handles it
  }
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

  const rl = checkAndBumpRateLimit(req);
  if (!rl.allowed) {
    res.status(429).json({ error: 'Rate limit reached for this server. Please try again later.' });
    return;
  }

  const { mode, input, depth, branchLabel, branchContext } = req.body || {};
  const depthKey = depth === 'quick' ? 'quick' : 'deep';

  if (!input || typeof input !== 'string' || !input.trim()) {
    res.status(400).json({ error: 'Missing input.' });
    return;
  }
  const safeInput = input.slice(0, MAX_INPUT_CHARS);

  try {
    /* ---------- branch regeneration mode ---------- */
    if (mode === 'branch') {
      if (!branchLabel || typeof branchLabel !== 'string') {
        res.status(400).json({ error: 'Missing branchLabel for branch regeneration.' });
        return;
      }
      const depthRules = DEPTH_RULES[depthKey] || DEPTH_RULES.deep;
      const branchSystemPrompt = `You are a mind map generator for ThunderStudy, used by Indian competitive exam students.
You will regenerate ONE branch of an existing mind map. Respond with ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:
{
  "label": "main branch label",
  "detail": "2-4 sentence standalone explanation of this branch",
  "children": [
    {
      "label": "sub-topic label",
      "detail": "2-4 sentence standalone explanation",
      "children": [
        { "label": "key fact / term / example", "detail": "2-4 sentence standalone explanation" }
      ]
    }
  ]
}
Maximum ${depthRules.maxChildren} children, maximum ${depthRules.maxGrand} grandchildren per child. ${depthRules.instructions}
${detailSchemaBlock()}
Output strictly valid JSON only.`;
      const branchUserPrompt = `The overall mind map topic is: "${safeInput}".\nRegenerate just this one branch: "${branchLabel}"${branchContext ? `\nAdditional context from the rest of the map: ${String(branchContext).slice(0, 2000)}` : ''}\nGive a fresh, possibly different angle or more accurate breakdown than before.`;

      const parsed = await getJsonFromGroq(apiKey, branchSystemPrompt, branchUserPrompt);
      if (!parsed || !parsed.label) {
        res.status(502).json({ error: 'AI response did not match the expected branch shape.' });
        return;
      }
      // Reuse clampMindMap's per-branch logic by wrapping
      const wrapped = clampMindMap({ title: 'x', branches: [parsed] }, depthKey);
      if (!wrapped) {
        res.status(502).json({ error: 'AI branch response could not be normalized.' });
        return;
      }
      res.status(200).json(wrapped.branches[0]);
      return;
    }

    /* ---------- full map generation (topic or content) ---------- */
    const systemPrompt = buildSystemPrompt(depthKey);
    const userPrompt = mode === 'topic'
      ? `Create a mind map for this topic: "${safeInput}"`
      : `Create a mind map summarising the key points of the following study text:\n\n${safeInput}`;

    const parsed = await getJsonFromGroq(apiKey, systemPrompt, userPrompt);
    const clamped = clampMindMap(parsed, depthKey);
    if (!clamped) {
      res.status(502).json({ error: 'AI response did not match the expected shape.' });
      return;
    }
    res.status(200).json(clamped);
  } catch (err) {
    console.error('Generate handler error:', err);
    if (err.message === 'AI provider error.') {
      res.status(502).json({ error: 'AI provider error.' });
    } else {
      res.status(502).json({ error: 'AI returned malformed JSON even after retry.' });
    }
  }
}
