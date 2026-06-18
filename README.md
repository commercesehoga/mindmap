# Thunder Mind Map

## What's in this folder
- `index.html` — the app (Create / Presets / My Maps)
- `app.js` — all client logic: credits, PDF parsing, renderer, save/export
- `api/generate.js` — Vercel serverless function that calls Groq (keeps your API key off the client)
- `presets/index.json` — list shown in the Presets tab
- `presets/*.json` — the actual preset mind maps (add more by dropping a new JSON file here in the same `{title, branches:[...]}` shape, then adding an entry to `index.json`)


## Credits system — important caveat
Daily (3) and weekly (12) credits are tracked in the visitor's own `localStorage`. This is consistent with your no-backend, no-paid-infra approach, but it means clearing browser storage resets their credits — there's no server-side enforcement. If you ever want it tamper-proof, the cleanest low-cost option is Vercel KV (free tier) keyed by IP or a generated device ID; happy to wire that up later if you want it.

## PDF page limit
`MAX_PDF_PAGES = 15` and `MAX_TEXT_CHARS = 9000` are both set in `app.js` (client) and mirrored as `MAX_INPUT_CHARS = 12000` in `api/generate.js` (server, as a safety net independent of the client). Change both if you want a different cap.

## The HTML watermark / brand-lock
Every downloaded HTML file embeds a `#ts-brand-lock` banner with your two links. The bundled renderer script checks that banner is present and intact before drawing the mind map — if someone strips it out, the file shows a "this file has been modified" message instead of the diagram. This only protects your own exported files; it's not applied anywhere else.
