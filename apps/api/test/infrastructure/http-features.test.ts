import { readdirSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { syntheticCourseGpx } from '../fixtures/course-gpx'
import { buildTestApp, multipart, registerUser, setUpPlan } from '../fixtures/test-app'

let app: FastifyInstance
let watchDir: string
let cookie: string

beforeAll(async () => {
  ;({ app, watchDir } = await buildTestApp(new Date('2027-03-03T06:30:00Z')))
  ;({ cookie } = await registerUser(app, 'f@kairn.test'))
  await setUpPlan(app, cookie)
})

afterAll(() => app.close())

const plan = async () => (await app.inject({ method: 'GET', url: '/api/plan', headers: { cookie } })).json()

describe('race plan (official GPX)', () => {
  it('imports the GPX, offers to align the goal and recomputes after aid station changes', async () => {
    const upload = multipart('file', 'course.gpx', syntheticCourseGpx(), 'application/gpx+xml')
    const response = await app.inject({ method: 'POST', url: '/api/race-course', headers: { cookie, ...upload.headers }, payload: upload.payload })
    expect(response.statusCode).toBe(200)
    const view = response.json()
    expect(view.course.aidStations).toHaveLength(2)
    expect(view.plan.splits).toHaveLength(3)
    expect(view.goalMismatch).toBeDefined()

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/race-course',
      headers: { cookie },
      payload: { aidStations: [{ name: 'Col', km: 10, major: false, cutoffH: 0.5 }] },
    })
    expect(updated.json().plan.splits.map((s: { name: string }) => s.name)).toEqual(['Col', 'Arrivée'])
    expect(updated.json().plan.warnings.join(' ')).toMatch(/Barrière horaire/)

    const goal = (await app.inject({ method: 'POST', url: '/api/race-course/apply-to-goal', headers: { cookie } })).json()
    expect(goal.distanceKm).toBeCloseTo(30, 0)
  })

  it('rejects a file that is not a GPX', async () => {
    const upload = multipart('file', 'course.txt', 'hello')
    const response = await app.inject({ method: 'POST', url: '/api/race-course', headers: { cookie, ...upload.headers }, payload: upload.payload })
    expect(response.statusCode).toBe(400)
  })
})

describe('morning check-in and adaptation', () => {
  it('recommends lightening the session of the day, then applies it', async () => {
    const today = '2027-03-03'
    const checkIn = { date: today, sleepHours: 5.5, sleepQuality: 2, soreness: 3, fatigue: 3, motivation: 3, stress: 3, illnessSymptoms: false }
    const result = (await app.inject({ method: 'POST', url: '/api/wellness/check-in', headers: { cookie }, payload: checkIn })).json()
    expect(result.readiness.level).toBe('ORANGE')
    expect(result.readiness.action).toBe('ALLEGER')

    const session = result.affectedSessions[0] ?? (await plan()).sessions.find((s: { date: string }) => s.date >= today)
    const lightened = (await app.inject({ method: 'POST', url: `/api/sessions/${session.id}/lighten`, headers: { cookie }, payload: { mode: 'ALLEGER' } })).json()
    expect(lightened.adjustment).toMatch(/bilan du matin/)
    expect((await plan()).adjustments[0].reason).toBe('FATIGUE')

    const overview = (await app.inject({ method: 'GET', url: '/api/wellness', headers: { cookie } })).json()
    expect(overview.today.readiness.score).toBe(result.readiness.score)
  })

  it('reports an illness and adapts the plan', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/plan/unavailability',
      headers: { cookie },
      payload: { from: '2027-03-15', to: '2027-03-19', reason: 'MALADIE', crossTrainingOk: false },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().adjustments[0].reason).toBe('MALADIE')
  })
})

describe('sessions to the watch', () => {
  it('downloads a session as FIT and drops the week into the watch folder', async () => {
    const run = (await plan()).sessions.find((s: { sport: string; type: string; status: string }) => s.sport === 'RUN' && s.type !== 'COURSE' && s.status === 'PLANNED')
    const fit = await app.inject({ method: 'GET', url: `/api/sessions/${run.id}/workout.fit`, headers: { cookie } })
    expect(fit.statusCode).toBe(200)
    expect(fit.headers['content-disposition']).toMatch(/kairn-.*\.fit/)
    expect(fit.rawPayload.subarray(8, 12).toString('ascii')).toBe('.FIT')

    const sent = (await app.inject({ method: 'POST', url: `/api/plan/weeks/${run.weekIndex}/send-to-watch`, headers: { cookie } })).json()
    expect(sent.sent.length).toBeGreaterThan(0)
    expect(readdirSync(watchDir).filter((f) => f.endsWith('.fit'))).toHaveLength(sent.sent.length)
  })
})
