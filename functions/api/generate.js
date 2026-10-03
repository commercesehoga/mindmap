// functions/api/generate.js — Cloudflare Pages Function  (route: /api/generate)
// Hides the Groq API key server-side.
//
// Environment variables (Cloudflare dashboard → Workers & Pages → your project →
// Settings → Variables and Secrets; for local testing copy .dev.vars.example to .dev.vars):
//   GROQ_API_KEY               required — your Groq API key
//   UPSTASH_REDIS_REST_URL     optional — enables the server-side rate-limit backstop
//   UPSTASH_REDIS_REST_TOKEN   optional — (both Upstash variables must be set)
//   ALLOWED_ORIGINS_EXTRA      optional — comma-separated extra origins, e.g. http://localhost:8788 for local dev
//
// GET  /api/generate  → health check: { ok: true, configured: <GROQ_API_KEY is set> }
// POST /api/generate  → generates a mind map (same request/response shape as before)

const ALLOWED_ORIGIN = 'https://mindmap.thunderstudy.indevs.in';

// Ordered fallback chain — tried top to bottom. If Groq closes/decommissions a model
// (404 / "decommissioned"), rate-limits it (429) or it errors (5xx), the next one is used.
// gpt-oss models are reasoning models: max_tokens also covers their thinking, so they get
// a bigger budget and reasoning_effort 'low'. Llama models reject reasoning_effort, so it's per-model.
const GROQ_MODELS = [
  { id: 'openai/gpt-oss-120b',      maxTokens: 6000, extra: { reasoning_effort: 'low' } },
  { id: 'openai/gpt-oss-20b',       maxTokens: 6000, extra: { reasoning_effort: 'low' } },
  { id: 'llama-3.3-70b-versatile',  maxTokens: 1800, extra: {} }, // being closed by Groq — last-resort only
  { id: 'llama-3.1-8b-instant',     maxTokens: 1800, extra: {} }
];
const deadModels = new Set(); // models Groq reported as gone; skipped for the life of this warm instance
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_INPUT_CHARS = 12000; // server-side safety net, independent of client limit
const MAX_BRANCHES = 7;
const MAX_CHILDREN = 5;
const MAX_GRANDCHILDREN = 4;

const SERVER_DAILY_LIMIT = 8;   // looser than client's 3 — this is a backstop, not the primary gate
const SERVER_WEEKLY_LIMIT = 30; // looser than client's 12, same reasoning

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

/* ---------- Origin check: only the Mind Map site may call the API ---------- */
function allowedOrigins(env) {
  const extra = String((env && env.ALLOWED_ORIGINS_EXTRA) || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [ALLOWED_ORIGIN, ...extra];
}
function isAllowedRequest(request, env) {
  const allowed = allowedOrigins(env);
  const origin = request.headers.get('Origin');
  if (origin) return allowed.includes(origin);
  // Same-origin GET requests may omit Origin — fall back to Fetch-Metadata / Referer.
  if (request.headers.get('Sec-Fetch-Site') === 'same-origin') return true;
  const ref = request.headers.get('Referer') || '';
  return allowed.some((o) => ref === o || ref.startsWith(o + '/'));
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const h = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (origin && allowedOrigins(env).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extraHeaders || {}) }
  });
}

/* ---------- Upstash Redis REST rate limiting (server backstop: 8/day, 30/week per IP) ---------- */
function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekKey() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}
function getClientKey(request) {
  const cf = request.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();
  const fwd = request.headers.get('X-Forwarded-For');
  return (fwd ? fwd.split(',')[0].trim() : '') || 'unknown';
}
async function upstash(env, commands) {
  const res = await fetch(`${String(env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error('Upstash HTTP ' + res.status);
  return res.json(); // [{ result: ... }, ...]
}
async function checkAndBumpRateLimit(request, env) {
  // If Upstash is not configured, skip server limiting (the client-side limit still applies).
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return { allowed: true, skipped: true };
  try {
    const ip = getClientKey(request);
    const dayKey = `tmm:rl:d:${todayStr()}:${ip}`;
    const weekK = `tmm:rl:w:${weekKey()}:${ip}`;
    const out = await upstash(env, [
      ['INCR', dayKey], ['EXPIRE', dayKey, 172800],
      ['INCR', weekK], ['EXPIRE', weekK, 1209600]
    ]);
    const dayCount = Number(out?.[0]?.result);
    const weekCount = Number(out?.[2]?.result);
    if (dayCount > SERVER_DAILY_LIMIT || weekCount > SERVER_WEEKLY_LIMIT) {
      // Rejected requests don't count against the visitor — undo the bump.
      upstash(env, [['DECR', dayKey], ['DECR', weekK]]).catch(() => {});
      return { allowed: false };
    }
    return { allowed: true };
  } catch (e) {
    // Never block real users because the limiter store is unreachable.
    console.warn('Rate limit store unavailable, skipping:', e.message);
    return { allowed: true, skipped: true };
  }
}

/* ---------- Groq call helper (used by both full-map and single-branch modes) ---------- */
async function callGroq(apiKey, systemPrompt, userPrompt) {
  for (const model of GROQ_MODELS) {
    if (deadModels.has(model.id)) continue;

    let groqRes;
    try {
      groqRes = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model.id,
          temperature: 0.4,
          max_tokens: model.maxTokens,
          response_format: { type: 'json_object' },
          ...model.extra,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
    } catch (netErr) {
      console.warn(`Groq network error on ${model.id}, trying next model:`, netErr.message);
      continue;
    }

    if (groqRes.ok) {
      const completion = await groqRes.json();
      return completion.choices?.[0]?.message?.content || '';
    }

    const errText = await groqRes.text();
    console.error(`Groq error on ${model.id}:`, groqRes.status, errText);

    // Bad/forbidden key fails on every model — no point falling through.
    if (groqRes.status === 401 || groqRes.status === 403) break;

    // Model closed / decommissioned → never try it again on this instance.
    if (groqRes.status === 404 || /decommission|deprecat|does not exist|not found/i.test(errText)) {
      deadModels.add(model.id);
    }
    // Any other failure (429, 5xx, json_validate_failed 400) → just move on to the next model.
  }
  throw new Error('AI provider error.');
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

/* ---------- Pages Function entry points ---------- */
export async function onRequestOptions({ request, env }) {
  if (!isAllowedRequest(request, env)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...corsHeaders(request, env), 'Access-Control-Max-Age': '86400' } });
}

export async function onRequestGet({ env }) {
  return json({ ok: true, configured: Boolean(env.GROQ_API_KEY) }, 200);
}

export async function onRequestPost({ request, env }) {
  const cors = corsHeaders(request, env);

  if (!isAllowedRequest(request, env)) {
    return json({ error: 'Forbidden' }, 403, cors);
  }

  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) {
    return json({ error: 'Server is not configured with a Groq API key.' }, 500, cors);
  }

  const rl = await checkAndBumpRateLimit(request, env);
  if (!rl.allowed) {
    return json({ error: 'Rate limit reached for this server. Please try again later.' }, 429, cors);
  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const { mode, input, depth, branchLabel, branchContext } = body || {};
  const depthKey = depth === 'quick' ? 'quick' : 'deep';

  if (!input || typeof input !== 'string' || !input.trim()) {
    return json({ error: 'Missing input.' }, 400, cors);
  }
  const safeInput = input.slice(0, MAX_INPUT_CHARS);

  try {
    /* ---------- branch regeneration mode ---------- */
    if (mode === 'branch') {
      if (!branchLabel || typeof branchLabel !== 'string') {
        return json({ error: 'Missing branchLabel for branch regeneration.' }, 400, cors);
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
        return json({ error: 'AI response did not match the expected branch shape.' }, 502, cors);
      }
      // Reuse clampMindMap's per-branch logic by wrapping
      const wrapped = clampMindMap({ title: 'x', branches: [parsed] }, depthKey);
      if (!wrapped) {
        return json({ error: 'AI branch response could not be normalized.' }, 502, cors);
      }
      return json(wrapped.branches[0], 200, cors);
    }

    /* ---------- full map generation (topic or content) ---------- */
    const systemPrompt = buildSystemPrompt(depthKey);
    const userPrompt = mode === 'topic'
      ? `Create a mind map for this topic: "${safeInput}"`
      : `Create a mind map summarising the key points of the following study text:\n\n${safeInput}`;

    const parsed = await getJsonFromGroq(apiKey, systemPrompt, userPrompt);
    const clamped = clampMindMap(parsed, depthKey);
    if (!clamped) {
      return json({ error: 'AI response did not match the expected shape.' }, 502, cors);
    }
    return json(clamped, 200, cors);
  } catch (err) {
    console.error('Generate handler error:', err);
    if (err.message === 'AI provider error.') {
      return json({ error: 'AI provider error.' }, 502, cors);
    } else {
      return json({ error: 'AI returned malformed JSON even after retry.' }, 502, cors);
    }
  }
}
