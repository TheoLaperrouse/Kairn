import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ActivityProvider, IntegrationTokens } from '../../src/application/ports'
import type { ActivityService } from '../../src/application/use-cases/activity-service'
import type { NotificationService } from '../../src/application/use-cases/notification-service'
import type { ImportedActivity } from '../../src/domain/activity/activity'
import { StravaActivityProvider } from '../../src/infrastructure/integrations/strava-provider'
import type { SqliteIntegrationStore } from '../../src/infrastructure/persistence/sqlite-repositories'
import { aGoal, aProfile } from '../fixtures/factories'
import { buildTestApp, multipart, type RecordingPushSender } from '../fixtures/test-app'

class FakeStrava implements ActivityProvider {
  readonly name = 'strava'
  feed: ImportedActivity[] = []
  isConfigured() {
    return true
  }
  authorizationUrl() {
    return 'https://strava.test'
  }
  async exchangeCode(): Promise<IntegrationTokens> {
    throw new Error('not used')
  }
  async refresh(tokens: IntegrationTokens) {
    return tokens
  }
  async fetchSince() {
    return this.feed.map((a) => ({ ...a }))
  }
}

const VERIFY = 'verify-token'
let app: FastifyInstance
let clock: { set(date: Date): void }
let push: RecordingPushSender
let notifications: NotificationService
let activityService: ActivityService
let integrations: SqliteIntegrationStore
let strava: FakeStrava
let cookie: string
let userId: string

type Session = { id: string; title: string; date: string; sport: string; type: string; durationMin: number; status: string; activityId?: string; purpose?: string }
type Activity = { id: string; name: string; plannedSessionId?: string; localDate?: string; externalId: string }

beforeAll(async () => {
  strava = new FakeStrava()
  ;({ app, clock, push, notifications, activityService, integrations } = await buildTestApp(new Date('2027-03-01T06:30:00Z'), {
    providers: [strava],
    stravaVerifyToken: VERIFY,
  }))
  const register = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'r@kairn.test', password: 'ultra-trail-2027' } })
  cookie = String(register.headers['set-cookie']).split(';')[0]!
  userId = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().user.id
  await app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie }, payload: aProfile() })
  await app.inject({ method: 'PUT', url: '/api/goal', headers: { cookie }, payload: aGoal() })
  await app.inject({ method: 'POST', url: '/api/plan/generate', headers: { cookie } })
  integrations.save(userId, 'strava', { accessToken: 'a', refreshToken: 'r', expiresAt: 4_000_000_000, athleteId: '42' })
})

afterAll(() => app.close())

const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } })
const sessions = async (): Promise<Session[]> => (await get('/api/plan')).json().sessions
const activities = async (): Promise<Activity[]> => (await get('/api/activities')).json()

/** Flat GPX run of `minutes`, starting at `start` (UTC ISO). */
function gpx(start: string, minutes: number, name = 'Sortie trail'): string {
  const points = Array.from({ length: minutes + 1 }, (_, i) => {
    const time = new Date(Date.parse(start) + i * 60_000).toISOString()
    return `<trkpt lat="${48 + i * 0.0017}" lon="-3"><ele>100</ele><time>${time}</time></trkpt>`
  }).join('')
  return `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>${name}</name><type>running</type><trkseg>${points}</trkseg></trk></gpx>`
}

async function upload(name: string, content: string) {
  const form = multipart('files', name, content, 'application/gpx+xml')
  return (await app.inject({ method: 'POST', url: '/api/activities/import', headers: { cookie, ...form.headers }, payload: form.payload })).json()[0]
}

describe('local day', () => {
  it('files a run started at 00:30 in Paris under that day, not the previous UTC day', async () => {
    const plan = await sessions()
    const run = plan.find((s) => s.sport === 'RUN' && s.date > '2027-03-01')!
    const previousDay = new Date(Date.parse(`${run.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    // 23:30 UTC the day before = 00:30 in Paris (UTC+1 in March).
    const outcome = await upload('night.gpx', gpx(`${previousDay}T23:30:00Z`, run.durationMin))
    expect(outcome.activity.localDate).toBe(run.date)
    expect(outcome.activity.plannedSessionId).toBe(run.id)
    await app.inject({ method: 'DELETE', url: `/api/activities/${outcome.activity.id}`, headers: { cookie } })
  })

  it('takes the local day straight from Strava', async () => {
    const provider = new StravaActivityProvider(
      { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://kairn.test/cb' },
      (async () =>
        new Response(
          JSON.stringify([
            {
              id: 7,
              name: 'Night Run',
              sport_type: 'TrailRun',
              start_date: '2027-03-02T23:30:00Z',
              start_date_local: '2027-03-03T00:30:00Z',
              moving_time: 1800,
              distance: 5000,
              total_elevation_gain: 50,
            },
          ]),
        )) as typeof fetch,
    )
    const [activity] = await provider.fetchSince({ accessToken: 'a', refreshToken: 'r', expiresAt: 0 }, new Date(0))
    expect(activity!.localDate).toBe('2027-03-03')
  })
})

describe('double session and naming', () => {
  it('re-links a day so each run gets the session that fits it best, and names it after the session', async () => {
    const day = '2027-03-03'
    const plan = await sessions()
    const easy = plan.find((s) => s.date === day && s.sport === 'RUN')!
    // The short run arrives first and takes the only run session; the run that fits it better arrives later.
    const short = await upload('short.gpx', gpx(`${day}T06:00:00Z`, 20))
    expect(short.activity.plannedSessionId).toBe(easy.id)
    const long = await upload('long.gpx', gpx(`${day}T17:00:00Z`, easy.durationMin))
    // Only one run session that day: the run whose duration fits takes it, the short one becomes a free run.
    expect(long.activity.plannedSessionId).toBe(easy.id)
    const list = await activities()
    const shortNow = list.find((a) => a.id === short.activity.id)!
    expect(shortNow.plannedSessionId).toBeUndefined()
    expect(shortNow.name).toMatch(/^Footing · /)
    expect(list.find((a) => a.id === long.activity.id)!.name).toBe(easy.title)
    const session = (await sessions()).find((s) => s.id === easy.id)!
    expect(session).toMatchObject({ status: 'DONE', activityId: long.activity.id })
  })

  it('keeps a name the runner chose', async () => {
    const outcome = await upload('named.gpx', gpx('2027-03-05T07:00:00Z', 30, 'Tour du lac'))
    expect(outcome.activity.name).toBe('Tour du lac')
  })
})

describe('Strava edits', () => {
  const notify = (payload: object) => app.inject({ method: 'POST', url: '/api/webhooks/strava', payload })

  it('follows a rename, a sport change and a deletion made on Strava', async () => {
    const day = '2027-03-06'
    const run = (await sessions()).find((s) => s.date === day && s.sport === 'RUN')!
    strava.feed = [
      {
        source: 'STRAVA',
        externalId: 'strava:99',
        sport: 'STRENGTH',
        name: 'Morning Workout',
        startTime: `${day}T07:00:00.000Z`,
        localDate: day,
        durationSec: run.durationMin * 60,
        distanceKm: 0,
        elevationGainM: 0,
        profile: [],
      },
    ]
    await activityService.sync(userId, 'strava')
    const imported = () => activities().then((list) => list.find((a) => a.externalId === 'strava:99')!)
    expect((await imported()).plannedSessionId).toBeUndefined()

    // Logged as a workout by mistake, fixed to a trail run on Strava: the run session is now done.
    await notify({ object_type: 'activity', aspect_type: 'update', object_id: 99, owner_id: 42, subscription_id: 1, updates: { type: 'TrailRun' } })
    expect((await imported()).plannedSessionId).toBe(run.id)

    await notify({ object_type: 'activity', aspect_type: 'update', object_id: 99, owner_id: 42, subscription_id: 1, updates: { title: 'Sortie longue au Ventoux' } })
    expect((await imported()).name).toBe('Sortie longue au Ventoux')

    await notify({ object_type: 'activity', aspect_type: 'delete', object_id: 99, owner_id: 42, subscription_id: 1 })
    expect(await imported()).toBeUndefined()
    expect((await sessions()).find((s) => s.id === run.id)).toMatchObject({ status: 'PLANNED' })
  })
})

describe('list verdicts and session purpose', () => {
  it('returns a verdict for every activity in one call', async () => {
    const list = await activities()
    const verdicts = (await get('/api/activities/verdicts')).json()
    expect(Object.keys(verdicts).sort()).toEqual(list.map((a) => a.id).sort())
    expect(Object.values(verdicts).every((v) => typeof (v as { verdict: string }).verdict === 'string')).toBe(true)
  })

  it('explains every session of the plan without storing the text', async () => {
    const plan = await sessions()
    expect(plan.every((s) => (s.purpose ?? '').length > 30)).toBe(true)
    const one = (await get(`/api/sessions/${plan[3]!.id}`)).json()
    expect(one.purpose).toBe(plan[3]!.purpose)
  })
})

describe('check-in reminder', () => {
  it('reminds to fill in the morning check-in on a session day when enabled', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/notifications/subscriptions',
      headers: { cookie },
      payload: { subscription: { endpoint: 'https://push.test/r', keys: { p256dh: 'k', auth: 'a' } }, timeZone: 'Europe/Paris' },
    })
    const status = (await get('/api/notifications')).json()
    expect(status.settings.checkIn).toEqual({ enabled: false, time: '09:00' })
    await app.inject({
      method: 'PUT',
      url: '/api/notifications/settings',
      headers: { cookie },
      payload: { ...status.settings, morning: { enabled: false, time: '07:00' }, checkIn: { enabled: true, time: '09:00' } },
    })
    const day = (await sessions()).find((s) => s.date > '2027-03-07' && s.status === 'PLANNED' && s.type !== 'COURSE')!.date
    push.sent.length = 0
    // 09:05 in Paris.
    clock.set(new Date(`${day}T08:05:00Z`))
    await notifications.tick()
    await notifications.tick()
    expect(push.sent.map((p) => p.message.tag)).toEqual(['check-in'])
  })
})
