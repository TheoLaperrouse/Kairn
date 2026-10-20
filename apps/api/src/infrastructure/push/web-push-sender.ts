import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign, type JsonWebKey } from 'node:crypto'
import type { PushSender, PushSubscription } from '../../application/ports'
import type { PushMessage } from '../../domain/notifications/notification'

/**
 * Web Push sans dépendance : chiffrement du message (RFC 8291, aes128gcm) et
 * identification du serveur auprès du service de push du navigateur (VAPID, RFC 8292).
 * Fonctionne avec Chrome / Android (FCM), Firefox (Mozilla) et Safari / iOS 16.4+ (Apple).
 */

/** Taille d'enregistrement annoncée ; le message chiffré doit tenir dans un seul enregistrement. */
const RECORD_SIZE = 4096
const MAX_PAYLOAD_BYTES = 3000
const TTL_SECONDS = 24 * 3600
const JWT_LIFETIME_SECONDS = 12 * 3600

function base64url(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString('base64url')
}

/** Paire de clés VAPID, sérialisée en JWK (clé privée P-256) pour être stockée. */
export function generateVapidKeys(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return JSON.stringify(privateKey.export({ format: 'jwk' }))
}

/** Clé publique au format attendu par `pushManager.subscribe` : point non compressé, base64url. */
export function vapidPublicKey(privateJwk: JsonWebKey): string {
  return base64url(Buffer.concat([Buffer.from([4]), Buffer.from(privateJwk.x!, 'base64url'), Buffer.from(privateJwk.y!, 'base64url')]))
}

/** Chiffre `payload` pour l'abonnement (clé publique `p256dh` et secret `auth` du navigateur). */
export function encryptPayload(payload: Buffer, subscription: PushSubscription, salt = randomBytes(16)): Buffer {
  const userAgentPublic = Buffer.from(subscription.keys.p256dh, 'base64url')
  const authSecret = Buffer.from(subscription.keys.auth, 'base64url')
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const serverPublic = ecdh.getPublicKey()
  const sharedSecret = ecdh.computeSecret(userAgentPublic)

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), userAgentPublic, serverPublic])
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32))
  const contentKey = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))

  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce)
  // 0x02 : délimiteur du dernier (et unique) enregistrement.
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(16 + 4 + 1)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header.writeUInt8(serverPublic.length, 20)
  return Buffer.concat([header, serverPublic, encrypted])
}

export interface WebPushOptions {
  /** JWK de la clé privée VAPID (voir `generateVapidKeys`). */
  privateKey: string
  /** Contact de l'administrateur : `mailto:` ou URL https (exigé par Apple). */
  subject: string
  http?: typeof fetch
  now?: () => Date
}

export class WebPushSender implements PushSender {
  private readonly jwk: JsonWebKey
  private readonly http: typeof fetch
  private readonly now: () => Date

  constructor(private readonly options: WebPushOptions) {
    this.jwk = JSON.parse(options.privateKey) as JsonWebKey
    this.http = options.http ?? fetch
    this.now = options.now ?? (() => new Date())
  }

  publicKey(): string {
    return vapidPublicKey(this.jwk)
  }

  async send(subscription: PushSubscription, message: PushMessage): Promise<'SENT' | 'GONE'> {
    const payload = Buffer.from(JSON.stringify(fit(message)))
    const response = await this.http(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${this.jwt(new URL(subscription.endpoint).origin)}, k=${this.publicKey()}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SECONDS),
        Urgency: 'normal',
      },
      body: new Uint8Array(encryptPayload(payload, subscription)),
    })
    if (response.status === 404 || response.status === 410) return 'GONE'
    if (!response.ok) throw new Error(`Service de push : ${response.status} ${await response.text().catch(() => '')}`.trim())
    return 'SENT'
  }

  private jwt(audience: string): string {
    const encode = (value: object) => base64url(Buffer.from(JSON.stringify(value)))
    const exp = Math.floor(this.now().getTime() / 1000) + JWT_LIFETIME_SECONDS
    const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({ aud: audience, exp, sub: this.options.subject })}`
    const key = createPrivateKey({ key: this.jwk, format: 'jwk' })
    const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
    return `${unsigned}.${base64url(signature)}`
  }
}

/** Raccourcit le texte si besoin : un message chiffré doit tenir dans un enregistrement. */
function fit(message: PushMessage): PushMessage {
  let body = message.body
  while (Buffer.byteLength(JSON.stringify({ ...message, body })) > MAX_PAYLOAD_BYTES) body = `${body.slice(0, Math.floor(body.length * 0.8))}…`
  return { ...message, body }
}
