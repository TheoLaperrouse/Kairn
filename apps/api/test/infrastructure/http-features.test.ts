import { readdirSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { syntheticCourseGpx } from '../fixtures/course-gpx'
import { aGoal, aProfile } from '../fixtures/factories'
import { buildTestApp, multipart } from '../fixtures/test-app'

let app: FastifyInstance
let watchDir: string
let cookie: string

beforeAll(async () => {
  ;({ app, watchDir } = await buildTestApp(new Date('2027-03-03T06:30:00Z')))
  const register = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'f@kairn.test', password: 'ultra-trail-2027' } })
  cookie = String(register.headers['set-cookie']).split(';')[0]!
  await app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie }, payload: aProfile() })
  await app.inject({ method: 'PUT', url: '/api/goal', headers: { cookie }, payload: aGoal() })
  await app.inject({ method: 'POST', url: '/api/plan/generate', headers: { cookie } })
})

afterAll(() => app.close())

const plan = async () => (await app.inject({ method: 'GET', url: '/api/plan', headers: { cookie } })).json()

describe('plan de course (GPX officiel)', () => {
  it('importe le GPX, propose d’aligner l’objectif et recalcule après modification des ravitos', async () => {
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

  it('refuse un fichier qui n’est pas un GPX', async () => {
    const upload = multipart('file', 'course.txt', 'hello')
    const response = await app.inject({ method: 'POST', url: '/api/race-course', headers: { cookie, ...upload.headers }, payload: upload.payload })
    expect(response.statusCode).toBe(400)
  })
})

describe('bilan du matin et adaptation', () => {
  it('recommande d’alléger la séance du jour puis l’applique', async () => {
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

  it('déclare une maladie et adapte le plan', async () => {
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

describe('séances vers la montre', () => {
  it('télécharge une séance au format FIT et dépose la semaine dans le dossier de la montre', async () => {
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
