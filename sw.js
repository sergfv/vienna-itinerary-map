// Minimal service worker: precache the app shell so the app opens (and the
// pins/notes work) even with a flaky connection. Map tiles stay network-first
// — caching OSM tiles aggressively is against their usage policy.
const CACHE = 'vienna-trip-v13';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './lz-string.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Tiles: network only (policy + freshness). Everything else: cache-first.
  if (url.hostname.endsWith('cartocdn.com') || url.hostname.endsWith('tile.openstreetmap.org')) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});

// Tapping the "next stop" reminder reopens the app on that stop.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          c.postMessage({ type: 'goto', dayId: data.dayId, idx: data.idx });
          return c.focus();
        }
      }
      return clients.openWindow('./');
    })()
  );
});
