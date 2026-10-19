// Offline support: the app shell is cached, the news is always fetched fresh
// when there is a connection and falls back to the last copy when offline.
const VERSION = 'rr-v26';
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

// Morning notifications
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Your briefing is here', {
    body: d.body || 'Tap to read today’s briefing.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'briefing',
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.focus(); return c.navigate ? c.navigate(url).catch(() => {}) : undefined; }
    return self.clients.openWindow(url);
  }));
});
