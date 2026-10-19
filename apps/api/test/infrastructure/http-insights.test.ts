import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RateLimitedError, type ActivityProvider, type IntegrationTokens } from '../../src/application/ports'
import type { ActivityService } from '../../src/application/use-cases/activity-service'
import type { NotificationService } from '../../src/application/use-cases/notification-service'
import type { ActivitySample, ImportedActivity } from '../../src/domain/activity/activity'
import type { SqliteIntegrationStore } from '../../src/infrastructure/persistence/sqlite-repositories'
import { aGoal, aProfile } from '../fixtures/factories'
import { buildTestApp, multipart, type RecordingPushSender } from '../fixtures/test-app'
import { track } from '../fixtures/tracks'

/** Faux Strava : liste d'activités sans trace, traces servies à part, quota simulable. */
class FakeStrava implements ActivityProvider {
  readonly name = 'strava'
  feed: ImportedActivity[] = []
  readonly streams = new Map<string, ActivitySample[]>()
  sampleCalls = 0
  quota = Infinity

  isConfigured() {
    return true
  }
  authorizationUrl() {
    return 'https://strava.test'
  }
  async exchangeCode(): Promise<IntegrationTokens> {
    throw new Error('non utilisé')
  }
  async refresh(tokens: IntegrationTokens) {
    return tokens
  }
  async fetchSince() {
    return this.feed.map((a) => ({ ...a }))
  }
  async fetchSamples(_tokens: IntegrationTokens, externalId: string) {
    this.sampleCalls++
    if (this.quota-- <= 0) throw new RateLimitedError('Strava')
    return this.streams.get(externalId) ?? []
  }
}

// Mercredi 3 mars 2027, 6 h 30 UTC = 7 h 30 à Paris.
const NOW = new Date('2027-03-03T06:30:00Z')

let app: FastifyInstance
let clock: { set(date: Date): void }
let push: RecordingPushSender
let notifications: NotificationService
let activityService: ActivityService
let integrations: SqliteIntegrationStore
let strava: FakeStrava
let cookie: string
let userId: string

beforeAll(async () => {
  strava = new FakeStrava()
  ;({ app, clock, push, notifications, activityService, integrations } = await buildTestApp(NOW, { providers: [strava] }))
  const register = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'i@kairn.test', password: 'ultra-trail-2027' } })
  cookie = String(register.headers['set-cookie']).split(';')[0]!
  userId = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().user.id
  await app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie }, payload: aProfile() })
  await app.inject({ method: 'PUT', url: '/api/goal', headers: { cookie }, payload: aGoal() })
  await app.inject({ method: 'POST', url: '/api/plan/generate', headers: { cookie } })
})

afterAll(() => app.close())

const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } })
const plan = async () => (await get('/api/plan')).json()

/** GPX d'une heure avec FC, montée de 200 m puis descente. */
function gpxWithHeartRate(date: string, hr: number): string {
  const points = Array.from({ length: 61 }, (_, i) => {
    const ele = 100 + (i <= 30 ? i * (200 / 30) : (60 - i) * (200 / 30))
    const time = new Date(Date.parse(`${date}T07:00:00Z`) + i * 60_000).toISOString()
    return `<trkpt lat="${48 + i * 0.0015}" lon="-3"><ele>${ele.toFixed(1)}</ele><time>${time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`
  }).join('')
  return `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Footing du matin</name><type>running</type><trkseg>${points}</trkseg></trk></gpx>`
}

describe('analyse d’une activité importée', () => {
  it('garde la trace détaillée, l’allège dans la liste et analyse la séance', async () => {
    const run = (await plan()).sessions.find((s: { date: string; sport: string }) => s.date === '2027-03-03' && s.sport === 'RUN')
    const upload = multipart('files', 'footing.gpx', gpxWithHeartRate('2027-03-03', 165), 'application/gpx+xml')
    const [outcome] = (await app.inject({ method: 'POST', url: '/api/activities/import', headers: { cookie, ...upload.headers }, payload: upload.payload })).json()
    expect(outcome.status).toBe('IMPORTED')
    expect(outcome.activity.samples).toBeUndefined()

    const id = outcome.activity.id
    // Un point par minute dans le fichier : le rééchantillonnage n'invente rien.
    expect((await get(`/api/activities/${id}`)).json().samples).toHaveLength(61)
    expect((await get('/api/activities')).json()[0].samples).toBeUndefined()

    const analysis = (await get(`/api/activities/${id}/analysis`)).json()
    expect(analysis.hasDetail).toBe(true)
    expect(analysis.zones.method).toBe('RESERVE')
    expect(analysis.zones.seconds[4]).toBeGreaterThan(3000)
    expect(analysis.climbs).toHaveLength(1)
    expect(analysis.comparison.sessionId).toBe(run.id)
    expect(analysis.verdict).toBe('TROP_INTENSE')
    // Import manuel : pas de notification.
    expect(push.sent).toHaveLength(0)
  })

  it('renvoie 404 pour l’activité d’un autre', async () => {
    expect((await get('/api/activities/inconnue/analysis')).statusCode).toBe(404)
  })
})

describe('bilan hebdomadaire', () => {
  it('présente la semaine demandée et refuse une date qui n’est pas un lundi', async () => {
    const summary = (await get('/api/summaries/weekly?week=2027-03-01')).json()
    expect(summary.weekStart).toBe('2027-03-01')
    expect(summary.inProgress).toBe(true)
    expect(summary.totals.activities).toBe(1)
    expect((await get('/api/summaries/weekly?week=2027-03-03')).statusCode).toBe(400)
    expect((await get('/api/summaries/weekly?week=2027-03-08')).statusCode).toBe(400)
    // Par défaut, la dernière semaine terminée.
    expect((await get('/api/summaries/weekly')).json().weekStart).toBe('2027-02-22')
  })
})

describe('notifications', () => {
  const subscription = (endpoint: string) => ({ endpoint, keys: { p256dh: 'BKey', auth: 'secret' } })

  it('abonne le téléphone dans son fuseau et règle les rappels', async () => {
    const status = (await get('/api/notifications')).json()
    expect(status.publicKey).toBe('BPublicKeyForTests')
    expect(status.devices).toEqual([])

    const subscribed = await app.inject({
      method: 'POST',
      url: '/api/notifications/subscriptions',
      headers: { cookie, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari' },
      payload: { subscription: subscription('https://push.test/phone'), timeZone: 'Europe/Paris' },
    })
    expect(subscribed.json().devices).toHaveLength(1)
    expect(subscribed.json().settings.timeZone).toBe('Europe/Paris')

    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/notifications/settings',
      headers: { cookie },
      payload: { ...subscribed.json().settings, morning: { enabled: true, time: '7h' } },
    })
    expect(invalid.statusCode).toBe(400)

    const test = await app.inject({ method: 'POST', url: '/api/notifications/test', headers: { cookie } })
    expect(test.json()).toEqual({ sent: 1 })
    expect(push.sent.at(-1)!.message.tag).toBe('test')
  })

  it('envoie le rappel du matin une seule fois, et oublie les abonnements expirés', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/notifications/subscriptions',
      headers: { cookie },
      payload: { subscription: subscription('https://push.test/gone-tablet') },
    })
    push.sent.length = 0
    // La séance du jour a déjà été faite (import ci-dessus) : on prend demain, jeudi 4 mars à 7 h 05 (Paris).
    clock.set(new Date('2027-03-04T06:05:00Z'))
    await notifications.tick()
    await notifications.tick()

    const tomorrow = (await plan()).sessions.filter((s: { date: string }) => s.date === '2027-03-04')
    expect(tomorrow.length).toBeGreaterThan(0)
    expect(push.sent).toHaveLength(1)
    expect(push.sent[0]!.message.tag).toBe('morning')
    expect(push.sent[0]!.message.body).toContain(tomorrow[0].title)
    expect((await get('/api/notifications')).json().devices.map((d: { endpoint: string }) => d.endpoint)).toEqual(['https://push.test/phone'])
  })

  it('envoie le bilan le dimanche soir', async () => {
    push.sent.length = 0
    clock.set(new Date('2027-03-07T18:10:00Z'))
    await notifications.tick()
    expect(push.sent.map((p) => p.message.tag)).toEqual(['weekly-2027-03-01'])
    clock.set(NOW)
  })
})

describe('agenda', () => {
  it('publie le plan sur une URL secrète, révocable', async () => {
    const { url } = (await get('/api/calendar')).json()
    expect(url).toMatch(/^https:\/\/kairn\.test\/api\/calendar\/[\w-]+\.ics$/)
    expect((await get('/api/calendar')).json().url).toBe(url)

    const path = new URL(url).pathname
    const feed = await app.inject({ method: 'GET', url: path })
    expect(feed.statusCode).toBe(200)
    expect(feed.headers['content-type']).toBe('text/calendar; charset=utf-8')
    expect(feed.body).toContain('X-WR-CALNAME:Kairn · CCC')

    const renewed = (await app.inject({ method: 'POST', url: '/api/calendar/regenerate', headers: { cookie } })).json().url
    expect(renewed).not.toBe(url)
    expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: new URL(renewed).pathname })).statusCode).toBe(200)
  })
})

describe('synchronisation Strava détaillée', () => {
  const summary = (id: number, startTime: string): ImportedActivity => ({
    source: 'STRAVA',
    externalId: `strava:${id}`,
    sport: 'RUN',
    name: `Sortie ${id}`,
    startTime,
    durationSec: 3600,
    distanceKm: 10,
    elevationGainM: 300,
    profile: [],
  })

  it('récupère la trace des nouvelles sorties, notifie la plus récente et complète l’historique plus tard', async () => {
    clock.set(new Date('2027-03-05T12:00:00Z'))
    integrations.save(userId, 'strava', { accessToken: 'a', refreshToken: 'r', expiresAt: 4_000_000_000 })
    const legs = track([{ minutes: 30, km: 5, climbM: 300, hr: 140 }, { minutes: 30, km: 5, climbM: -300, hr: 135 }])
    strava.streams.set('strava:1', legs)
    strava.streams.set('strava:2', legs)
    strava.feed = [summary(1, '2027-03-05T07:00:00Z'), summary(2, '2027-01-20T07:00:00Z')]
    strava.quota = 1
    push.sent.length = 0

    await activityService.sync(userId, 'strava')
    const list = (await get('/api/activities')).json() as Array<{ id: string; externalId: string; profile: unknown[] }>
    const recent = list.find((a) => a.externalId === 'strava:1')!
    const old = list.find((a) => a.externalId === 'strava:2')!
    expect((await get(`/api/activities/${recent.id}`)).json().samples.length).toBeGreaterThan(300)
    expect(recent.profile.length).toBeGreaterThan(10)
    // Quota atteint : la trace de l'ancienne sortie viendra plus tard.
    expect((await get(`/api/activities/${old.id}`)).json().samples).toBeUndefined()
    // Seule la sortie du jour est notifiée, avec son analyse.
    expect(push.sent.map((p) => p.message.tag)).toEqual([`analysis-${recent.id}`])
    expect(push.sent[0]!.message.body).toContain('montée')

    strava.quota = Infinity
    await activityService.sync(userId, 'strava')
    expect((await get(`/api/activities/${old.id}`)).json().samples.length).toBeGreaterThan(300)
    const calls = strava.sampleCalls
    await activityService.sync(userId, 'strava')
    expect(strava.sampleCalls).toBe(calls)
    clock.set(NOW)
  })
})
