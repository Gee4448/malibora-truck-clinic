// This address closed on 2 Sep 2026. The app lives at
// https://malibora-clinic.vercel.app — this worker replaces the old cached
// app, wipes its caches, unregisters itself and sends open tabs there.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim()
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    await self.registration.unregister()
    const tabs = await self.clients.matchAll({ type: 'window' })
    for (const tab of tabs) {
      const u = new URL(tab.url)
      tab.navigate('https://malibora-clinic.vercel.app' + u.pathname + u.search)
    }
  })())
})
