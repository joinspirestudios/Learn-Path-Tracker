/* Learn Path Tracker service worker — browser push only.
 *
 * Renders incoming push notifications (title/body/icon/badge/actionUrl) and
 * opens the in-app actionUrl on click. It shows ONLY the public-safe fields the
 * server sends; it never has access to private proof, reflections, evidence
 * URLs, Storage paths, or tokens. No app-asset caching is performed in this
 * phase. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushData(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch (error) {
    try {
      return { body: event.data.text() };
    } catch (innerError) {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const data = parsePushData(event);
  const title = (data.title || 'Learn Path Tracker').slice(0, 120);
  const options = {
    body: (data.body || '').slice(0, 280),
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || data.type || 'learn-path',
    data: { actionUrl: typeof data.actionUrl === 'string' ? data.actionUrl : '' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const actionUrl = (event.notification.data && event.notification.data.actionUrl) || '';
  // Only open in-app hash routes or same-origin relative paths.
  const safe = /^#\//.test(actionUrl) || /^\/(?!\/)/.test(actionUrl);
  const target = safe && actionUrl ? actionUrl : '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        try {
          if (target.startsWith('#') && 'navigate' in client) {
            await client.navigate(self.registration.scope.replace(/\/$/, '') + '/' + target);
          }
        } catch (error) { /* fall through to focus */ }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return undefined;
  })());
});
