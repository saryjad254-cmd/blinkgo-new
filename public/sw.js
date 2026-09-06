// BlinkGo Service Worker — v31
// Push notifications + privacy-safe offline shell. API/auth responses are never cached.

const STATIC_CACHE = 'blinkgo-static-v31';
const PRECACHE = [
  '/offline.html',
  '/brand/blinkgo-app-icon-192-v2.png',
  '/brand/blinkgo-notification-badge-96-v2.png',
  '/brand/blinkgo-official-compact-transparent.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => { if (!self.registration.active) return self.skipWaiting(); }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('blinkgo-static-') && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  if (url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      })),
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'BlinkGo', body: event.data.text() };
  }
  const options = {
    body: data.body ?? '',
    icon: data.icon ?? '/brand/blinkgo-app-icon-192-v2.png',
    badge: '/brand/blinkgo-notification-badge-96-v2.png',
    image: data.image,
    data: data.data ?? {},
    tag: data.tag ?? 'blinkgo-notification',
    requireInteraction: data.requireInteraction ?? false,
    actions: data.actions ?? [],
    vibrate: [200, 100, 200],
  };
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'BlinkGo', options),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url;
  const safePath = typeof requestedUrl === 'string' && requestedUrl.startsWith('/')
    ? requestedUrl
    : '/notifications';
  const targetUrl = new URL(safePath, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
