// ونس service worker: Web Push only. It caches nothing, so it can never serve a stale build.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  const call = d.kind === 'call';
  e.waitUntil(self.registration.showNotification(d.title || 'ونس', Object.assign({ body: d.body || '', tag: call ? 'call-' + d.call : 'chat-' + (d.chat || 'x'), renotify: true, dir: 'rtl', lang: 'ar', data: { chat: d.chat || null, call: call ? d.call : null } },
    call ? { requireInteraction: true, vibrate: [300, 150, 300, 150, 300], actions: [{ action: 'accept', title: 'رد' }, { action: 'decline', title: 'رفض' }] } : {})));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close(); const chat = (e.notification.data && e.notification.data.chat) || null, call = (e.notification.data && e.notification.data.call) || null;
  if (call && e.action === 'decline') return; // a closed app cannot sign the decline; the caller's 35s ring ends in a missed-call line
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ type: call ? 'open-call' : 'open-chat', chat, call }); return; } }
    await self.clients.openWindow(self.registration.scope + (call ? '?call=' + encodeURIComponent(call) + '&chat=' + encodeURIComponent(chat) : chat ? '?chat=' + encodeURIComponent(chat) : ''));
  })());
});
