// Offline support: keep a copy of the game on the device.
const CACHE = 'jasperdoku-v10';
const FILES = [
  './', './index.html', './css/style.css', './js/config.js', './js/engine.js', './js/app.js',
  './assets/jasper.png', './assets/jasper-full.png', './assets/leo.png', './assets/leo-full.png', './assets/jasper-placeholder.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png', './manifest.webmanifest',
];
self.addEventListener('install', (e) => {
  // 'reload' skips the browser's short-term file cache so a new version is saved right away
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates show up right away), fall back to the saved copy offline.
// For the game's own files, 'no-cache' makes the browser check GitHub for a newer version
// every time instead of reusing a file it saved minutes ago.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const own = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    fetch(own ? new Request(e.request, { cache: 'no-cache' }) : e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
