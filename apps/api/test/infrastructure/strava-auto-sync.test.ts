import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { ActivityProvider, IntegrationTokens } from '../../src/application/ports'
import type { ActivityService } from '../../src/application/use-cases/activity-service'
import type { ImportedActivity } from '../../src/domain/activity/activity'
import type { SqliteIntegrationStore } from '../../src/infrastructure/persistence/sqlite-repositories'
import { buildTestApp } from '../fixtures/test-app'

/** Fake Strava: each athlete (identified by their access token) has their own activities. */
class FakeStrava implements ActivityProvider {
  readonly name = 'strava'
  readonly feed = new Map<string, ImportedActivity[]>()
  calls = 0
  failFor?: string

  isConfigured() {
    return true
  }
  authorizationUrl() {
    return 'https://strava.test/authorize'
  }
  async exchangeCode(): Promise<IntegrationTokens> {
    throw new Error('not used')
  }
  async refresh(tokens: IntegrationTokens) {
    return tokens
  }
  async fetchSince(tokens: IntegrationTokens) {
    this.calls++
    if (tokens.accessToken === this.failFor) throw new Error('Strava a répondu 401')
    return this.feed.get(tokens.accessToken) ?? []
  }
}

const run = (id: number, startTime = '2027-03-03T06:00:00Z'): ImportedActivity => ({
  source: 'STRAVA',
  externalId: `strava:${id}`,
  sport: 'RUN',
  name: `Sortie ${id}`,
  startTime,
  durationSec: 3600,
  distanceKm: 10,
  elevationGainM: 400,
  profile: [],
})

const VERIFY_TOKEN = 'secret-de-verification'
const tokens = (accessToken: string, athleteId?: string): IntegrationTokens => ({
  accessToken,
  refreshToken: 'r',
  expiresAt: 4_000_000_000,
  athleteId,
})

let app: FastifyInstance
let integrations: SqliteIntegrationStore
let strava: FakeStrava
let activityService: ActivityService
const users: { id: string; cookie: string }[] = []

beforeAll(async () => {
  strava = new FakeStrava()
  ;({ app, integrations, activityService } = await buildTestApp(new Date('2027-03-03T08:00:00Z'), { providers: [strava], stravaVerifyToken: VERIFY_TOKEN }))
  for (const email of ['a@kairn.test', 'b@kairn.test', 'c@kairn.test']) {
    const register = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'ultra-trail-2027' } })
    const cookie = String(register.headers['set-cookie']).split(';')[0]!
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    users.push({ id: me.json().user.id, cookie })
  }
})

afterAll(() => app.close())

beforeEach(() => {
  strava.feed.clear()
  strava.calls = 0
  strava.failFor = undefined
  integrations.save(users[0]!.id, 'strava', tokens('A', '111'))
  integrations.save(users[1]!.id, 'strava', tokens('B', '222'))
  // Connection made before athlete ids were stored.
  integrations.save(users[2]!.id, 'strava', tokens('C'))
})

const activityCount = async (cookie: string) => (await app.inject({ method: 'GET', url: '/api/activities', headers: { cookie } })).json().length
const notify = (payload: object) => app.inject({ method: 'POST', url: '/api/webhooks/strava', payload })
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('Strava webhook', () => {
  it('validates the subscription only with the right token', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: `/api/webhooks/strava?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=${VERIFY_TOKEN}`,
    })
    expect(ok.json()).toEqual({ 'hub.challenge': 'abc' })
    const forged = await app.inject({ method: 'GET', url: '/api/webhooks/strava?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=faux' })
    expect(forged.statusCode).toBe(403)
  })

  it('imports the new activity for the matching athlete only, without a session', async () => {
    strava.feed.set('A', [run(1)])
    strava.feed.set('B', [run(2)])
    const response = await notify({ object_type: 'activity', aspect_type: 'create', object_id: 1, owner_id: 111, subscription_id: 9 })
    expect(response.statusCode).toBe(200)
    await settle()
    expect(await activityCount(users[0]!.cookie)).toBe(1)
    expect(await activityCount(users[1]!.cookie)).toBe(0)
    expect(strava.calls).toBe(1)
  })

  it('unknown athlete: syncs connections whose athlete id is not yet known', async () => {
    strava.feed.set('C', [run(3)])
    await notify({ object_type: 'activity', aspect_type: 'create', object_id: 3, owner_id: 333, subscription_id: 9 })
    await settle()
    expect(await activityCount(users[2]!.cookie)).toBe(1)
    expect(strava.calls).toBe(1)
  })

  it('disconnects an athlete who revokes access from Strava', async () => {
    await notify({ object_type: 'athlete', aspect_type: 'update', object_id: 222, owner_id: 222, subscription_id: 9, updates: { authorized: 'false' } })
    const statuses = (await app.inject({ method: 'GET', url: '/api/integrations', headers: { cookie: users[1]!.cookie } })).json()
    expect(statuses[0].connected).toBe(false)
  })
})

describe('periodic sync', () => {
  it('syncs all accounts without duplicates and isolates errors', async () => {
    strava.feed.set('A', [run(10), run(11, '2027-03-02T06:00:00Z')])
    strava.feed.set('C', [run(12)])
    strava.failFor = 'B'
    const before = await activityCount(users[0]!.cookie)
    const results = await activityService.syncAll('strava')
    const byUser = Object.fromEntries(results.map((r) => [r.userId, [r.imported, Boolean(r.error)]]))
    expect(byUser).toEqual({ [users[0]!.id]: [2, false], [users[1]!.id]: [0, true], [users[2]!.id]: [1, false] })

    const again = await activityService.syncAll('strava')
    expect(again.map((r) => r.imported)).toEqual([0, 0, 0])
    expect(await activityCount(users[0]!.cookie)).toBe(before + 2)
  })

  it('does not run two concurrent syncs for the same account', async () => {
    strava.feed.set('A', [run(20)])
    const [first, second] = await Promise.all([activityService.sync(users[0]!.id, 'strava'), activityService.sync(users[0]!.id, 'strava')])
    expect(first).toBe(second)
    expect(strava.calls).toBe(1)
  })
})
