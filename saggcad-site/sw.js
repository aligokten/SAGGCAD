/* Eski SAGGCAD web uygulamasının service worker'ını kaldırır: önbellekleri siler, kendini kaydından çıkarır ve açık
 * sekmeleri yeni sayfaya yeniler. (Tarayıcı güncelleme denetiminde bu dosyayı indirince eski önbellek devreden çıkar.) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('saggcad-')) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
