// BlinkGo Service Worker — v29
// Handles push notifications and basic caching.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
    icon: data.icon ?? '/brand/icon-192.png',
    badge: '/brand/icon-192.png',
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
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
