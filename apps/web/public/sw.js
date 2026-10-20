/*
 * Kairn service worker: notifications only (no offline cache,
 * the app is always served fresh by the server).
 */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kairn', {
      body: data.body || '',
      tag: data.tag,
      data: { url: data.url || '/' },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'fr',
    }),
  )
})

// Tapping the notification opens the relevant page, in the existing Kairn tab if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (existing) {
        await existing.focus()
        if ('navigate' in existing) await existing.navigate(url).catch(() => undefined)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})

// The browser renewed the subscription: notify the server (the session cookie goes with the request).
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription && event.oldSubscription.options.applicationServerKey
  if (!key) return
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then((subscription) =>
      fetch('/api/notifications/subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      }),
    ),
  )
})
