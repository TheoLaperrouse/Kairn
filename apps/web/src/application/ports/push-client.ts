import type { PushSubscriptionPayload } from '../../domain/models'

/**
 * Capacité de l'appareil à recevoir des notifications :
 * - `NEEDS_INSTALL` : iPhone / iPad, il faut d'abord ajouter Kairn à l'écran d'accueil ;
 * - `INSECURE` : page servie en http (hors localhost), le navigateur refuse ;
 * - `DENIED` : l'utilisateur a bloqué les notifications pour ce site.
 */
export type PushSupport = 'SUPPORTED' | 'UNSUPPORTED' | 'NEEDS_INSTALL' | 'INSECURE' | 'DENIED'

/** Port vers les notifications du navigateur (service worker + Push API). */
export interface PushClient {
  support(): PushSupport
  /** Abonnement actuel de cet appareil, s'il existe. */
  currentEndpoint(): Promise<string | undefined>
  subscribe(publicKey: string): Promise<PushSubscriptionPayload>
  /** Retourne l'endpoint désabonné. */
  unsubscribe(): Promise<string | undefined>
  timeZone(): string
}
