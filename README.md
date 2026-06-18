# Thunder Mind Map — Setup Notes

## What's in this folder
- `index.html` — the app (Create / Presets / My Maps)
- `app.js` — all client logic: credits, PDF parsing, renderer, save/export
- `api/generate.js` — Vercel serverless function that calls Groq (keeps your API key off the client)
- `presets/index.json` — list shown in the Presets tab
- `presets/*.json` — the actual preset mind maps (add more by dropping a new JSON file here in the same `{title, branches:[...]}` shape, then adding an entry to `index.json`)

## Deploying on Vercel
1. Push this folder to a GitHub repo (or `vercel` CLI deploy directly from this folder).
2. Import the repo in Vercel — no build step needed, it's static + one serverless function.
3. In **Project Settings → Environment Variables**, add:
   - `GROQ_API_KEY` = your Groq key (Production + Preview)
4. Add your custom domain `mindmap.thunderstudy.indevs.in` in **Settings → Domains**, then point a CNAME at Vercel per their instructions (same pattern you already used for your other subdomains).

## Credits system — important caveat
Daily (3) and weekly (12) credits are tracked in the visitor's own `localStorage`. This is consistent with your no-backend, no-paid-infra approach, but it means clearing browser storage resets their credits — there's no server-side enforcement. If you ever want it tamper-proof, the cleanest low-cost option is Vercel KV (free tier) keyed by IP or a generated device ID; happy to wire that up later if you want it.

## PDF page limit
`MAX_PDF_PAGES = 15` and `MAX_TEXT_CHARS = 9000` are both set in `app.js` (client) and mirrored as `MAX_INPUT_CHARS = 12000` in `api/generate.js` (server, as a safety net independent of the client). Change both if you want a different cap.

## The HTML watermark / brand-lock
Every downloaded HTML file embeds a `#ts-brand-lock` banner with your two links. The bundled renderer script checks that banner is present and intact before drawing the mind map — if someone strips it out, the file shows a "this file has been modified" message instead of the diagram. This only protects your own exported files; it's not applied anywhere else.

## Groq model
Currently set to `llama-3.3-70b-versatile` in `api/generate.js`. If Groq deprecates it, swap the `GROQ_MODEL` constant — `openai/gpt-oss-120b` is a solid current alternative on their free tier.

## Still to add (from our brainstorm, not yet built)
Flashcard/quiz generation from a branch, referral credits, server-side rate limiting, multi-language toggle, voice input. Say the word when you want the next one.
