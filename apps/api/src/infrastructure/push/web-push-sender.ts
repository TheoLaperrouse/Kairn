import { createCipheriv, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign, type JsonWebKey } from 'node:crypto'
import type { PushSender, PushSubscription } from '../../application/ports'
import type { PushMessage } from '../../domain/notifications/notification'

/**
 * Dependency-free Web Push: message encryption (RFC 8291, aes128gcm) and
 * server identification with the browser's push service (VAPID, RFC 8292).
 * Works with Chrome / Android (FCM), Firefox (Mozilla) and Safari / iOS 16.4+ (Apple).
 */

/** Advertised record size; the encrypted message must fit in a single record. */
const RECORD_SIZE = 4096
const MAX_PAYLOAD_BYTES = 3000
const TTL_SECONDS = 24 * 3600
const JWT_LIFETIME_SECONDS = 12 * 3600

function base64url(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString('base64url')
}

/** VAPID key pair, serialised as a JWK (P-256 private key) for storage. */
export function generateVapidKeys(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return JSON.stringify(privateKey.export({ format: 'jwk' }))
}

/** Public key in the format expected by `pushManager.subscribe`: uncompressed point, base64url. */
export function vapidPublicKey(privateJwk: JsonWebKey): string {
  return base64url(Buffer.concat([Buffer.from([4]), Buffer.from(privateJwk.x!, 'base64url'), Buffer.from(privateJwk.y!, 'base64url')]))
}

/** Encrypts `payload` for the subscription (the browser's `p256dh` public key and `auth` secret). */
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
  // 0x02: delimiter of the last (and only) record.
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(16 + 4 + 1)
  salt.copy(header, 0)
  header.writeUInt32BE(RECORD_SIZE, 16)
  header.writeUInt8(serverPublic.length, 20)
  return Buffer.concat([header, serverPublic, encrypted])
}

export interface WebPushOptions {
  /** JWK of the VAPID private key (see `generateVapidKeys`). */
  privateKey: string
  /** Administrator contact: `mailto:` or https URL (required by Apple). */
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

/** Shortens the text if needed: an encrypted message must fit in one record. */
function fit(message: PushMessage): PushMessage {
  let body = message.body
  while (Buffer.byteLength(JSON.stringify({ ...message, body })) > MAX_PAYLOAD_BYTES) body = `${body.slice(0, Math.floor(body.length * 0.8))}…`
  return { ...message, body }
}
