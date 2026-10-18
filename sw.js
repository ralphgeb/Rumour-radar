// Offline support: the app shell is cached, the news is always fetched fresh
// when there is a connection and falls back to the last copy when offline.
const VERSION = 'rr-v19';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'weather.js', 'tube.js', 'stocks.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.endsWith('.json')) {
    // network first
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(new Request(url.pathname), copy));
      return res;
    }).catch(() => caches.match(new Request(url.pathname))));
    return;
  }

  // app files: serve from cache, refresh in the background
  e.respondWith(caches.match(e.request).then((cached) => {
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
