import type { PushClient, PushSupport } from '../../application/ports/push-client'
import type { PushSubscriptionPayload } from '../../domain/models'

/** Registers the notification service worker; no-op if the browser does not support it. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false
  const view = new Uint8Array(a)
  return view.every((byte, i) => byte === b[i])
}

export class BrowserPushClient implements PushClient {
  support(): PushSupport {
    if (!window.isSecureContext) return 'INSECURE'
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    // On iOS, the Push API only exists in the app added to the home screen (iOS 16.4+).
    if (appleMobile && !isStandalone()) return 'NEEDS_INSTALL'
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'UNSUPPORTED'
    if (Notification.permission === 'denied') return 'DENIED'
    return 'SUPPORTED'
  }

  async currentEndpoint(): Promise<string | undefined> {
    if (this.support() !== 'SUPPORTED') return undefined
    const registration = await navigator.serviceWorker.getRegistration()
    return (await registration?.pushManager.getSubscription())?.endpoint
  }

  async subscribe(publicKey: string): Promise<PushSubscriptionPayload> {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Notifications refusées : autorise-les pour Kairn dans les réglages du navigateur.')
    registerServiceWorker()
    const registration = await navigator.serviceWorker.ready
    const key = keyBytes(publicKey)
    let subscription = await registration.pushManager.getSubscription()
    // Subscription created with another server key (reinstall): replace it.
    if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
      await subscription.unsubscribe()
      subscription = null
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
    const json = subscription.toJSON()
    return { endpoint: subscription.endpoint, keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! } }
  }

  async unsubscribe(): Promise<string | undefined> {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return undefined
    await subscription.unsubscribe()
    return subscription.endpoint
  }

  timeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
  }
}
