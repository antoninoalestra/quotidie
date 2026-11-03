/* Quotidie — service worker: l'app si apre anche senza rete.
   - App e font: risposta immediata dalla cache, aggiornata in background.
   - Contenuti (data/*.json): prima la rete, la cache solo se manca il segnale. */
const VERSION = 'quotidie-v3';
const SHELL = ['./', './index.html', './style.css', './app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API di GitHub e altri servizi: sempre dalla rete
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !isFont) return;

  // Audio MP3: non intercettare con Service Worker per consentire lo streaming HTTP e i Range requests (206) su Safari
  if (url.pathname.endsWith('.mp3')) return;

  if (url.origin === self.location.origin && url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req, event));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(stripSearch(req), res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(stripSearch(req));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(VERSION);
  const key = req.mode === 'navigate' ? './index.html' : req;
  const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
  const update = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return (await update) || new Response('Offline', { status: 503, statusText: 'Offline' });
}

// I contenuti vengono chiesti con ?v=… per evitare la cache del browser: in cache si salvano senza
function stripSearch(req) {
  const url = new URL(req.url);
  url.search = '';
  return url.href;
}
