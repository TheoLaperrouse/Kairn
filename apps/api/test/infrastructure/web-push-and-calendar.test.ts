import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { IcsCalendarEncoder, escape, fold } from '../../src/infrastructure/calendar/ics-calendar-encoder'
import { WebPushSender, encryptPayload, generateVapidKeys, vapidPublicKey } from '../../src/infrastructure/push/web-push-sender'
import { aGoal } from '../fixtures/factories'
import { aSession } from '../fixtures/tracks'

/** Browser side: subscription keys and RFC 8291 decryption, written independently of the sender. */
function browser() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = randomBytes(16)
  const subscription = {
    endpoint: 'https://push.example.net/send/abc',
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
  }
  const decrypt = (body: Buffer) => {
    const salt = body.subarray(0, 16)
    const recordSize = body.readUInt32BE(16)
    const idLength = body[20]!
    const serverPublic = body.subarray(21, 21 + idLength)
    const encrypted = body.subarray(21 + idLength)
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), serverPublic])
    const ikm = Buffer.from(hkdfSync('sha256', ecdh.computeSecret(serverPublic), auth, info, 32))
    const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
    const decipher = createDecipheriv('aes-128-gcm', key, nonce)
    decipher.setAuthTag(encrypted.subarray(-16))
    const plain = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()])
    expect(plain.at(-1)).toBe(2)
    return { recordSize, text: plain.subarray(0, -1).toString('utf8') }
  }
  return { subscription, decrypt }
}

describe('Web Push', () => {
  it('encrypts the message so that only the subscribed browser can read it', () => {
    const { subscription, decrypt } = browser()
    const body = encryptPayload(Buffer.from('Séance clé aujourd’hui 🏃'), subscription)
    expect(decrypt(body)).toEqual({ recordSize: 4096, text: 'Séance clé aujourd’hui 🏃' })
    // Fresh salt and ephemeral key for every message.
    expect(encryptPayload(Buffer.from('x'), subscription).equals(encryptPayload(Buffer.from('x'), subscription))).toBe(false)
    expect(() => browser().decrypt(body)).toThrow()
  })

  it('signs the VAPID request and delivers the message to the push service', async () => {
    const privateKey = generateVapidKeys()
    const { subscription, decrypt } = browser()
    const requests: Array<{ url: string; init: RequestInit }> = []
    const sender = new WebPushSender({
      privateKey,
      subject: 'https://kairn.example.fr',
      now: () => new Date('2027-03-03T06:00:00Z'),
      http: (async (url: string, init: RequestInit) => {
        requests.push({ url, init })
        return new Response(null, { status: 201 })
      }) as typeof fetch,
    })
    const publicKey = sender.publicKey()
    expect(Buffer.from(publicKey, 'base64url')).toHaveLength(65)
    expect(publicKey).toBe(vapidPublicKey(JSON.parse(privateKey)))

    const message = { title: 'Séance du jour', body: '🏃 Footing · 1 h', url: '/seance/s1', tag: 'morning' }
    await expect(sender.send(subscription, message)).resolves.toBe('SENT')

    const { url, init } = requests[0]!
    expect(url).toBe(subscription.endpoint)
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Encoding']).toBe('aes128gcm')
    expect(JSON.parse(decrypt(Buffer.from(init.body as Uint8Array)).text)).toEqual(message)

    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(headers.Authorization!)!
    expect(key).toBe(publicKey)
    const [header, payload, signature] = token!.split('.')
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({
      aud: 'https://push.example.net',
      exp: Date.parse('2027-03-03T18:00:00Z') / 1000,
      sub: 'https://kairn.example.fr',
    })
    const jwk = JSON.parse(privateKey)
    const verifier = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' })
    expect(verify('sha256', Buffer.from(`${header}.${payload}`), { key: verifier, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature!, 'base64url'))).toBe(true)
  })

  it('detects an expired subscription and surfaces other errors', async () => {
    const { subscription } = browser()
    const respond = (status: number) =>
      new WebPushSender({ privateKey: generateVapidKeys(), subject: 'mailto:a@b.c', http: (async () => new Response('quota', { status })) as typeof fetch })
    const message = { title: 't', body: 'b', url: '/', tag: 't' }
    await expect(respond(410).send(subscription, message)).resolves.toBe('GONE')
    await expect(respond(404).send(subscription, message)).resolves.toBe('GONE')
    await expect(respond(429).send(subscription, message)).rejects.toThrow('429 quota')
  })
})

describe('iCalendar feed', () => {
  it('escapes text and folds lines without splitting an emoji', () => {
    expect(escape('Côtes; 6, puis\nretour \\ calme')).toBe('Côtes\\; 6\\, puis\\nretour \\\\ calme')
    const line = `SUMMARY:${'🏃'.repeat(30)}`
    const folded = fold(line)
    for (const part of folded.split('\r\n')) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75)
    expect(folded.split('\r\n ').join('')).toBe(line)
  })

  it('publishes one all-day event per session, skipping cancelled ones', () => {
    const ics = new IcsCalendarEncoder().encode({
      name: 'Kairn · CCC',
      goal: aGoal(),
      baseUrl: 'https://kairn.example.fr',
      generatedAt: new Date('2027-03-01T10:00:00Z'),
      sessions: [
        aSession({
          id: 's1',
          date: '2027-03-03',
          status: 'PLANNED',
          title: 'Côtes courtes',
          keySession: true,
          durationMin: 55,
          steps: [{ kind: 'EFFORT', label: 'Côte', durationMin: 1, repeat: 8, zone: 5 }],
        }),
        aSession({ id: 's2', date: '2027-03-04', status: 'SKIPPED' }),
        aSession({ id: 's3', date: '2027-03-05', status: 'DONE', title: 'Footing', durationMin: 60 }),
        aSession({ id: 'race', date: '2027-08-27', type: 'RACE', status: 'PLANNED' }),
      ],
    })
    const unfolded = ics.replace(/\r\n /g, '')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true)
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(unfolded).toContain('UID:s1@kairn\r\nDTSTAMP:20270301T100000Z\r\nDTSTART;VALUE=DATE:20270303\r\nDTEND;VALUE=DATE:20270304')
    expect(unfolded).toContain('SUMMARY:🏃 Côtes courtes · 55 min ★')
    expect(unfolded).toContain('• 8 × Côte — 1 min (Z5)')
    expect(unfolded).toContain('URL:https://kairn.example.fr/seance/s1')
    expect(unfolded).toContain('SUMMARY:✓ 🏃 Footing · 1 h')
    expect(unfolded).toContain('SUMMARY:🏁 CCC')
    expect(unfolded).not.toContain('UID:s2@kairn')
  })
})
