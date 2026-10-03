/* ThunderStudy AI Mind Map - service worker
 * - app shell + offline page are cached on install
 * - HTML pages: network-first (fall back to cache, then /offline)
 * - assets (icons, css/js/images): cache-first
 * - /presets/*.json: cached, refreshed in the background
 * - /api/* is NEVER cached and never touched by this worker
 * Bump CACHE_VERSION whenever the shell list changes.
 */
const CACHE_VERSION = 'tmm-v1';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const ASSET_CACHE = CACHE_VERSION + '-assets';
const PRESET_CACHE = CACHE_VERSION + '-presets';
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE, PRESET_CACHE];

const SHELL_URLS = [
  '/', '/app', '/about', '/faq', '/new', '/pricing', '/performance', '/offline',
  '/manifest.json', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-192.png', '/icons/icon-maskable-512.png'
];
const PRESET_URLS = [
  '/presets/index.json',
  '/presets/ssc-cgl-full-syllabus.json',
  '/presets/cuet-general-test.json',
  '/presets/banking-awareness.json'
];

// Add each URL on its own so one missing file never breaks the whole install.
async function precache(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (res && res.ok) await cache.put(url, res);
    } catch (e) { /* offline during install - skip */ }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([precache(SHELL_CACHE, SHELL_URLS), precache(PRESET_CACHE, PRESET_URLS)])
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tmm-') && !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    const offline = await cache.match('/offline');
    return offline || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await refresh) || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;            // CDNs, fonts, etc. go straight to the network
  if (url.pathname.startsWith('/api/')) return;               // never cache or intercept the API
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith('/presets/') && url.pathname.endsWith('.json')) {
    event.respondWith(staleWhileRevalidate(request, PRESET_CACHE));
    return;
  }
  event.respondWith(cacheFirst(request, ASSET_CACHE));
});
