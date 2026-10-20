/*
 * Kairn service worker: offline app shell, last-known API data and push notifications.
 * `VERSION` and `PRECACHE` are injected at build time (see vite.config.ts); in development
 * the worker only handles notifications.
 */
const SHELL_CACHE = `kairn-shell-${VERSION}`
const DATA_CACHE = 'kairn-data'
/** Beyond this wait, the cached copy is shown while the network keeps trying in the background. */
const NETWORK_TIMEOUT_MS = 4000
/** API responses that are not worth keeping offline (downloads, redirects to a provider). */
const UNCACHED_API = /^\/api\/(calendar|integrations\/[^/]+\/connect)|\.fit$/

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (CACHING) await (await caches.open(SHELL_CACHE)).addAll(['/index.html', ...PRECACHE])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith('kairn-shell-') && name !== SHELL_CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (!CACHING || url.origin !== self.location.origin) return

  if (request.method !== 'GET') {
    // Logging out leaves nothing of the account on the device.
    if (url.pathname === '/api/auth/logout') event.waitUntil(caches.delete(DATA_CACHE))
    return
  }
  if (url.pathname.startsWith('/api/')) {
    if (!UNCACHED_API.test(url.pathname)) event.respondWith(apiResponse(event, request))
    return
  }
  if (request.mode === 'navigate') event.respondWith(pageResponse(event, request))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(assetResponse(request))
  else event.respondWith(staticResponse(event, request))
})

/** Resolves with the network response, or `undefined` once the timeout has elapsed. */
function withTimeout(promise) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS))])
}

/** Pages: the latest index.html, or the cached one when offline or on a poor connection. */
async function pageResponse(event, request) {
  const network = fetch(request)
  event.waitUntil(network.then((response) => response.ok && caches.open(SHELL_CACHE).then((c) => c.put('/index.html', response.clone()))).catch(() => undefined))
  const response = await withTimeout(network.catch(() => undefined))
  return response ?? (await caches.match('/index.html')) ?? network
}

/** Hashed build files never change: cache first. */
async function assetResponse(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) (await caches.open(SHELL_CACHE)).put(request, response.clone())
  return response
}

/** Icons, manifest, motion clips: served from the cache and refreshed in the background. */
async function staticResponse(event, request) {
  const cached = await caches.match(request)
  const network = fetch(request).then(async (response) => {
    if (response.ok) await (await caches.open(SHELL_CACHE)).put(request, response.clone())
    return response
  })
  if (cached) {
    event.waitUntil(network.catch(() => undefined))
    return cached
  }
  return network
}

/**
 * API: fresh data when the network answers in time, otherwise the last copy, marked with
 * an `X-Kairn-Offline` header so the app can tell the user.
 */
async function apiResponse(event, request) {
  const network = fetch(request).then(async (response) => {
    const cache = await caches.open(DATA_CACHE)
    if (response.ok && response.headers.get('content-type')?.includes('json')) await cache.put(request, response.clone())
    else if (response.status === 401) await caches.delete(DATA_CACHE)
    return response
  })
  event.waitUntil(network.catch(() => undefined))
  const response = await withTimeout(network.catch(() => undefined))
  if (response) return response
  const cached = await caches.match(request, { cacheName: DATA_CACHE })
  if (!cached) return network
  const headers = new Headers(cached.headers)
  headers.set('X-Kairn-Offline', '1')
  return new Response(cached.body, { status: cached.status, headers })
}

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
