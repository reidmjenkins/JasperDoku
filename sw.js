// Offline support: keep a copy of the game on the device.
const CACHE = 'jasperdoku-v48';
const FILES = [
  './', './index.html', './room.html', './css/style.css', './js/config.js', './js/engine.js', './js/journal.js', './js/app.js',
  './assets/jasper.webp', './assets/jasper-full.webp', './assets/leo.webp', './assets/leo-full.webp', './assets/jasper-placeholder.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png', './manifest.webmanifest',
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
// Pictures: use the copy saved on the phone instantly, and refresh it quietly in the background.
// Everything else: network first (so updates show up right away), saved copy when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const own = url.origin === location.origin;
  const isPicture = own && /\.(webp|png|svg|jpg|jpeg)$/i.test(url.pathname);
  if (isPicture) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true }).then((hit) => {
      const fresh = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || fresh;
    })));
    return;
  }
  e.respondWith(
    fetch(own ? new Request(e.request, { cache: 'no-cache' }) : e.request).then((res) => {
      if (res.ok && own) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
