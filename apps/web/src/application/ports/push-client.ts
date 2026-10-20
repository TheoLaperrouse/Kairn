import type { PushSubscriptionPayload } from '../../domain/models'

/**
 * Whether the device can receive notifications:
 * - `NEEDS_INSTALL`: iPhone / iPad, Kairn must first be added to the home screen;
 * - `INSECURE`: page served over http (outside localhost), the browser refuses;
 * - `DENIED`: the user blocked notifications for this site.
 */
export type PushSupport = 'SUPPORTED' | 'UNSUPPORTED' | 'NEEDS_INSTALL' | 'INSECURE' | 'DENIED'

export interface PushClient {
  support(): PushSupport
  currentEndpoint(): Promise<string | undefined>
  subscribe(publicKey: string): Promise<PushSubscriptionPayload>
  /** Returns the unsubscribed endpoint. */
  unsubscribe(): Promise<string | undefined>
  timeZone(): string
}
