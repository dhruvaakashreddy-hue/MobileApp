// Bizzar Buzzar service worker. It only shows alerts. It never caches or fetches drop data.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Bizzar Buzzar', body: 'A drop is about to release.', url: '/', tag: 'bizzar-drop' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // Keep the default text if the payload is not JSON.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.openWindow(url));
});
