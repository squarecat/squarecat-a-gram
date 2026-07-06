// Push service worker. Scope '/' (served from root).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'New post', body: '', url: '/' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'New post', {
      body: data.body || '',
      icon: '/assets/icon-256.png',
      badge: '/assets/icon-256.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if (win.url === url && 'focus' in win) return win.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
