// functions/api/youtube-transcript.js — Cloudflare Pages Function  (route: /api/youtube-transcript)
// Fetches YouTube video transcripts via youtube-transcript.ai
// (free, no API key). We proxy server-side so the browser never hits those services directly.
//
// Usage: GET /api/youtube-transcript?id=VIDEO_ID
//
// Returns: { transcript: "full plain text..." }
// Errors:  { error: "reason" }  with appropriate HTTP status
//
// Only https://mindmap.thunderstudy.indevs.in may call this (see isAllowedRequest below).
// Optional env: ALLOWED_ORIGINS_EXTRA (comma-separated extra origins for local dev).

const ALLOWED_ORIGIN = 'https://mindmap.thunderstudy.indevs.in';

function allowedOrigins(env, request) {
  const extra = String((env && env.ALLOWED_ORIGINS_EXTRA) || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Also trust the host that is serving this very deployment (custom domain, *.pages.dev, preview URLs).
  let self = '';
  try { self = new URL(request.url).origin; } catch (e) {}
  return [ALLOWED_ORIGIN, ...(self ? [self] : []), ...extra];
}
function isAllowedRequest(request, env) {
  const allowed = allowedOrigins(env, request);
  const origin = request.headers.get('Origin');
  if (origin) return allowed.includes(origin);
  // Same-origin GET requests usually omit Origin — fall back to Fetch-Metadata / Referer.
  if (request.headers.get('Sec-Fetch-Site') === 'same-origin') return true;
  const ref = request.headers.get('Referer') || '';
  return allowed.some((o) => ref === o || ref.startsWith(o + '/'));
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const h = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (origin && allowedOrigins(env, request).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extraHeaders || {}) }
  });
}

export async function onRequestOptions({ request, env }) {
  if (!isAllowedRequest(request, env)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...corsHeaders(request, env), 'Access-Control-Max-Age': '86400' } });
}

export async function onRequestGet({ request, env }) {
  const cors = corsHeaders(request, env);

  if (!isAllowedRequest(request, env)) {
    return json({ error: 'Forbidden' }, 403, cors);
  }

  const videoId = (new URL(request.url).searchParams.get('id') || '').trim();

  // Validate: YouTube IDs are exactly 11 alphanumeric/dash/underscore chars
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return json({ error: 'Missing or invalid video ID.' }, 400, cors);
  }

  // ── Primary: youtube-transcript.ai ───────────────────────────────────────
  // Returns clean Markdown with a metadata header then the transcript text.
  // Free, no key, edge-cached, CORS-open — ideal for server-side use too.
  try {
    const ytaiRes = await fetch(
      `https://youtube-transcript.ai/transcript/${encodeURIComponent(videoId)}.txt`,
      {
        headers: {
          'User-Agent': 'ThunderMindMap/1.0 (transcript-fetch)',
          'Accept': 'text/plain, text/markdown, */*'
        }
      }
    );

    if (ytaiRes.ok) {
      const raw = await ytaiRes.text();

      // The response is Markdown with a metadata header block, e.g.:
      // ---
      // title: "Video Title"
      // source: https://youtube.com/...
      // language: en
      // ...
      // ---
      // [0:00] First line of transcript...
      //
      // We strip the front-matter and timestamp markers to get clean text.
      let text = raw;

      // Remove YAML front-matter block (--- ... ---)
      text = text.replace(/^---[\s\S]*?---\s*/m, '');

      // Remove timestamp markers like [0:00] [1:23] [10:45]
      text = text.replace(/\[\d+:\d+\]/g, '');

      // Collapse excessive whitespace / blank lines
      text = text.replace(/\n{3,}/g, '\n\n').trim();

      if (text.length > 50) {
        return json({ transcript: text }, 200, cors);
      }
    }
  } catch (e) {
    console.warn('youtube-transcript.ai failed:', e.message);
  }

  // ── Fallback A: mongj youtube-transcriber-api (Vercel, Python/jdepoix) ──
  // GET /v1/transcripts?id=VIDEO_ID&type=text&lang=en
  try {
    const mongRes = await fetch(
      `https://youtube-transcriber-api.vercel.app/v1/transcripts?id=${encodeURIComponent(videoId)}&type=text&lang=en`,
      { headers: { 'User-Agent': 'ThunderMindMap/1.0' } }
    );

    if (mongRes.ok) {
      const data = await mongRes.json();
      // Returns { transcripts: [{ text: "..." }] }
      const transcripts = Array.isArray(data.transcripts) ? data.transcripts : [];
      const text = (transcripts[0]?.text || '').trim();
      if (text.length > 50) {
        return json({ transcript: text }, 200, cors);
      }
    }
  } catch (e) {
    console.warn('mongj fallback failed:', e.message);
  }

  // ── Fallback B: jaypaun007 youtube-transcript-api (POST endpoint) ─────────
  try {
    const jayRes = await fetch(
      'https://youtube-transcript-api-tau-one.vercel.app/transcript',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'ThunderMindMap/1.0' },
        body: JSON.stringify({ video_url: `https://www.youtube.com/watch?v=${videoId}` })
      }
    );

    if (jayRes.ok) {
      const data = await jayRes.json();
      const text = (data.transcript || '').trim();
      if (text.length > 50) {
        return json({ transcript: text }, 200, cors);
      }
    }
  } catch (e) {
    console.warn('jaypaun007 fallback failed:', e.message);
  }

  // All sources exhausted
  return json({
    error: 'Could not fetch transcript. The video may not have captions, or may be private/restricted.'
  }, 502, cors);
}