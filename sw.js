/* Ukulele Master service worker: makes the app installable and usable offline.
   Strategy: network first for our own files (so a deploy shows up on the next online visit without any version bump),
   falling back to the cache when offline or slow. Fonts are cache first. Everything is precached on install,
   so the app works offline even if it was opened only once. */
const CACHE = 'uke-master-shell-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/dsp.js', 'js/data.js', 'js/diagrams.js', 'js/audio.js', 'js/mic.js', 'js/ui.js', 'js/pwa.js',
  'js/song-catalog.js', 'js/song-goal.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;

  if (fonts) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((res) => { c.put(req, res.clone()); return res; })));
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // The query string (?date=…, ?view=…) only changes what the page shows, never which file is served.
    const key = req.mode === 'navigate' ? 'index.html' : url.pathname;
    try {
      const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(3500)]);
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    } catch (err) {
      const hit = (await cache.match(key)) || (await cache.match(req, { ignoreSearch: true }));
      if (hit) return hit;
      throw err;
    }
  })());
});
