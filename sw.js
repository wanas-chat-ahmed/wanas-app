// ونس service worker: Web Push only. It caches nothing, so it can never serve a stale build.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'ونس', { body: d.body || '', tag: 'chat-' + (d.chat || 'x'), renotify: true, dir: 'rtl', lang: 'ar', data: { chat: d.chat || null } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close(); const chat = (e.notification.data && e.notification.data.chat) || null;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ type: 'open-chat', chat }); return; } }
    await self.clients.openWindow(self.registration.scope + (chat ? '?chat=' + encodeURIComponent(chat) : ''));
  })());
});
