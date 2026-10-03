# ThunderStudy AI Mind Map

Free AI mind map maker for students — https://mindmap.thunderstudy.indevs.in
Built by **Wondermayank**. Hosted on **Cloudflare Pages**; the AI runs on **Groq** through Pages Functions, so your API key never reaches the browser.

## What is in this folder

```
index.html                 landing page (/)
app.html                   the tool (/app): Create / Presets / My Maps, PDF reading, renderer, save and export
about.html, faq.html, pricing.html, performance.html, new.html (changelog)
preset.html (/preset), save.html (/save, noindex)
offline.html, 404.html     both noindex
assets/og-image.png        1200x630 default social share image
presets/index.json         list shown in the Presets tab
presets/*.json             the preset mind maps ({title, branches:[...]})

functions/api/generate.js            POST /api/generate   (GET = health check)
functions/api/youtube-transcript.js  GET  /api/youtube-transcript?id=VIDEO_ID

sw.js, manifest.json, icons/         installable app + offline support
robots.txt, sitemap.xml, llms.txt, llms-full.txt, humans.txt, ads.txt, .well-known/security.txt
_headers, _redirects, _routes.json   Cloudflare Pages configuration
<key>.txt, indexnow-submit.sh        IndexNow (tell search engines about new URLs)
.dev.vars.example                    template for local environment variables
```

There is no `app.js`: all client logic lives inside `app.html`. `index.html` is only the landing page.

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub repo. Keep `functions/` at the project root.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Build settings: framework preset **None**, build command **empty**, output directory **/** (the repo root).
4. Add the custom domain `mindmap.thunderstudy.indevs.in` under **Custom domains**.
5. Set the environment variables below, then redeploy.

### Environment variables (Settings → Variables and Secrets)

| Name | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | yes | Groq API key used by `/api/generate` |
| `UPSTASH_REDIS_REST_URL` | optional | Upstash Redis REST URL for the server-side rate limit |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Upstash Redis REST token (set both Upstash variables or neither) |
| `ALLOWED_ORIGINS_EXTRA` | optional | Extra allowed origins for local testing, e.g. `http://localhost:8788` |

Check the setup by opening `https://mindmap.thunderstudy.indevs.in/api/generate` — it should return `{"ok":true,"configured":true}`.

## Local testing

```
cp .dev.vars.example .dev.vars      # fill in GROQ_API_KEY and set ALLOWED_ORIGINS_EXTRA=http://localhost:8788
npx wrangler pages dev .
```

## How limits work

- **Client (primary gate):** 3 maps a day and 12 a week, kept in the visitor's `localStorage` (`tmm_credits`). Clearing browser storage resets them. Constants: `DAILY_LIMIT`, `WEEKLY_LIMIT` in `app.html`.
- **Server (backstop):** 8 a day and 30 a week per IP, stored in Upstash Redis (`SERVER_DAILY_LIMIT`, `SERVER_WEEKLY_LIMIT` in `functions/api/generate.js`). If the Upstash variables are missing, or Upstash is unreachable, server limiting is skipped and requests are not blocked.
- **Origin check:** both API routes only accept requests from `https://mindmap.thunderstudy.indevs.in`. This stops casual use from other sites; it is not a replacement for the rate limit.

## Input limits

`MAX_PDF_PAGES = 15` and `MAX_TEXT_CHARS = 9000` are set in `app.html` (client). `MAX_INPUT_CHARS = 12000` in `functions/api/generate.js` is a server-side safety net. Change both sides together.

## Presets

Add a preset by dropping a new JSON file in `presets/` in the same `{title, branches:[...]}` shape, then adding an entry to `presets/index.json`. Add the file to `PRESET_URLS` in `sw.js` and bump `CACHE_VERSION` so it is cached offline.

## Service worker

`sw.js` precaches the app shell, `/offline` and the presets. Pages are network-first, assets are cache-first, presets refresh in the background, and `/api/*` is never cached. Bump `CACHE_VERSION` in `sw.js` whenever you change the shell list.

## The HTML watermark / brand-lock

Every downloaded HTML file embeds a `#ts-brand-lock` banner with your links. The bundled renderer checks that the banner is present and intact before drawing the mind map; if someone strips it, the file shows a "this file has been modified" message instead of the diagram. It only protects exported files.

## IndexNow

After deploying, run `./indexnow-submit.sh`. It posts every URL in `sitemap.xml` to `https://api.indexnow.org/indexnow`. The key file in the root (`<key>.txt`) must stay reachable at `https://mindmap.thunderstudy.indevs.in/<key>.txt`.
