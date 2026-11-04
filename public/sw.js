// Auralis service worker. The game needs its server, so nothing is cached for offline play: it only swaps a failed
// page load for a friendly offline page (installed web apps and the Play Store app both expect one).
const CACHE = 'auralis-offline-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // everything else (scripts, API, images) goes straight to the network
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});

// Reminders pushed by the server while Auralis is closed; tapping one opens (or focuses) the app.
self.addEventListener('push', (e) => {
  const d = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(d.title ?? 'Auralis', { body: d.body, tag: d.tag, icon: '/icon-192.png', badge: '/icon-192.png' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('/'))));
});
