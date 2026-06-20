// api/youtube-transcript.js — Vercel serverless function
// Fetches YouTube video transcripts via youtube-transcript.ai
// (free, no API key, CORS-open from their end but we proxy server-side
//  so we avoid any browser CORS quirks and keep the client clean)
//
// Usage: GET /api/youtube-transcript?id=VIDEO_ID
//
// Returns: { transcript: "full plain text..." }
// Errors:  { error: "reason" }  with appropriate HTTP status

export default async function handler(req, res) {
  // CORS headers — allow the mind map app to call this from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const videoId = (req.query.id || '').trim();

  // Validate: YouTube IDs are exactly 11 alphanumeric/dash/underscore chars
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'Missing or invalid video ID.' });
    return;
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
        res.status(200).json({ transcript: text });
        return;
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
        res.status(200).json({ transcript: text });
        return;
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
        res.status(200).json({ transcript: text });
        return;
      }
    }
  } catch (e) {
    console.warn('jaypaun007 fallback failed:', e.message);
  }

  // All sources exhausted
  res.status(502).json({
    error: 'Could not fetch transcript. The video may not have captions, or may be private/restricted.'
  });
}
