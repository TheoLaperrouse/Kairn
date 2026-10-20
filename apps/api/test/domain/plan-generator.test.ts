import { describe, expect, it } from 'vitest'
import { generatePlan, type PlanRequest } from '../../src/domain/plan/plan-generator'
import { addDays, weekday } from '../../src/domain/shared/dates'
import { aGoal, aProfile, routineSummaries } from '../fixtures/factories'

function request(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    planId: 'plan',
    goal: aGoal(),
    profile: aProfile(),
    today: '2027-03-01',
    createdAt: '2027-03-01T08:00:00Z',
    routines: routineSummaries,
    ...overrides,
  }
}

describe('generatePlan', () => {
  it('splits the build-up into ordered phases up to race week', () => {
    const plan = generatePlan(request())
    const phases = plan.weeks.map((w) => w.phase)
    expect(phases[0]).toBe('BASE')
    expect(phases.at(-1)).toBe('RACE')
    expect(phases.at(-2)).toBe('TAPER')
    const order = ['BASE', 'BUILD', 'SPECIFIC', 'TAPER', 'RACE']
    const ranks = phases.map((p) => order.indexOf(p))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('puts the race on race day and the long run on the chosen day', () => {
    const plan = generatePlan(request())
    expect(plan.sessions.filter((s) => s.type === 'RACE').map((s) => s.date)).toEqual(['2027-08-27'])
    const longRuns = plan.sessions.filter((s) => s.type === 'LONG_RUN')
    expect(longRuns.length).toBeGreaterThan(10)
    expect(longRuns.every((s) => weekday(s.date) === 5)).toBe(true)
  })

  it('schedules back-to-backs and a race simulation in the specific phase for an ultra', () => {
    const plan = generatePlan(request())
    expect(plan.sessions.some((s) => s.type === 'BACK_TO_BACK')).toBe(true)
    expect(plan.sessions.filter((s) => s.type === 'SIMULATION')).toHaveLength(1)
  })

  it('adds neither cycling nor strength when the athlete opts out', () => {
    const profile = aProfile({ crossTraining: { cycling: false, cyclingSessionsPerWeek: 1, strength: false, strengthSessionsPerWeek: 1 } })
    const plan = generatePlan(request({ profile }))
    expect(plan.sessions.some((s) => s.sport === 'BIKE' || s.sport === 'STRENGTH')).toBe(false)
  })

  it('links each strength session to a routine suited to the phase', () => {
    const plan = generatePlan(request())
    const strength = plan.sessions.filter((s) => s.sport === 'STRENGTH')
    expect(strength.length).toBeGreaterThan(0)
    for (const session of strength) {
      const week = plan.weeks.find((w) => w.index === session.weekIndex)!
      const routine = routineSummaries.find((r) => r.id === session.routineId)!
      expect(routine.phases).toContain(week.phase)
    }
  })

  it('respects the maximum weekly hours and lightens recovery weeks', () => {
    const plan = generatePlan(request({ profile: aProfile({ maxWeeklyHours: 8 }) }))
    expect(Math.max(...plan.weeks.map((w) => w.targetHours))).toBeLessThanOrEqual(8)
    const recovery = plan.weeks.find((w) => w.isRecovery)!
    const before = plan.weeks[recovery.index - 1]!
    expect(recovery.targetHours).toBeLessThan(before.targetHours)
  })

  it('only schedules on available days (except the race)', () => {
    const plan = generatePlan(request())
    const allowed = new Set(aProfile().availableDays)
    expect(plan.sessions.filter((s) => s.type !== 'RACE').every((s) => allowed.has(weekday(s.date)))).toBe(true)
  })

  it('warns about a short build-up and rejects less than 4 weeks', () => {
    const short = generatePlan(request({ today: '2027-06-28' }))
    expect(short.warnings.some((w) => w.includes('Préparation courte'))).toBe(true)
    expect(() => generatePlan(request({ today: '2027-08-16' }))).toThrow(/au moins 4 semaines/)
  })

  it('adapts elevation gain to the available terrain', () => {
    const flat = generatePlan(request({ profile: aProfile({ terrain: 'FLAT' }) }))
    const mountain = generatePlan(request({ profile: aProfile({ terrain: 'MOUNTAINS' }) }))
    const total = (p: typeof flat) => p.weeks.reduce((s, w) => s + w.targetElevationM, 0)
    expect(total(mountain)).toBeGreaterThan(total(flat) * 2)
    expect(flat.warnings.some((w) => w.includes('terrain plat'))).toBe(true)
  })

  it('keeps race day, the days after it and the day before free, even for a Monday race', () => {
    for (const raceDate of ['2027-08-23', '2027-08-24', '2027-08-28']) {
      const plan = generatePlan(request({ goal: aGoal({ raceDate }), profile: aProfile({ availableDays: [0, 1, 2, 3, 6], longRunDay: 6 }) }))
      const others = plan.sessions.filter((s) => s.type !== 'RACE')
      expect(others.every((s) => s.date < addDays(raceDate, -1))).toBe(true)
    }
  })

  it('tapers from the volume actually reached when the build-up is too short to hit the peak', () => {
    const profile = aProfile({ level: 'BEGINNER', availableDays: [0, 2, 5, 6], longRunDay: 6, maxWeeklyHours: 8, currentWeeklyKm: 0, currentWeeklyElevationM: 0 })
    const plan = generatePlan(request({ today: '2027-07-19', profile }))
    expect(plan.weeks.filter((w) => w.phase === 'TAPER').length).toBeLessThanOrEqual(2)
    const loading = plan.weeks.filter((w) => w.index > 0 && !w.isRecovery && w.phase !== 'TAPER' && w.phase !== 'RACE')
    const taper = plan.weeks.filter((w) => w.phase === 'TAPER')
    expect(Math.max(...taper.map((w) => w.targetHours))).toBeLessThan(Math.max(...loading.map((w) => w.targetHours)))
  })

  it('never makes an easy run longer than the week’s long run', () => {
    const plan = generatePlan(request({ profile: aProfile({ level: 'ADVANCED', availableDays: [1, 3, 5, 6], longRunDay: 6, maxWeeklyHours: 15 }) }))
    for (const week of plan.weeks.filter((w) => w.phase !== 'RACE')) {
      const sessions = plan.sessions.filter((s) => s.weekIndex === week.index)
      const long = sessions.find((s) => s.type === 'LONG_RUN' || s.type === 'SIMULATION')
      if (!long) continue
      expect(sessions.filter((s) => s.type === 'ENDURANCE').every((s) => s.durationMin <= long.durationMin)).toBe(true)
    }
  })

  it('drops the least important runs rather than exceed a small weekly budget', () => {
    const profile = aProfile({ level: 'EXPERT', availableDays: [0, 1, 2, 3, 4, 5, 6], longRunDay: 6, maxWeeklyHours: 5 })
    const plan = generatePlan(request({ goal: aGoal({ distanceKm: 15, elevationGainM: 600 }), today: '2027-06-01', profile }))
    expect(Math.max(...plan.weeks.map((w) => w.targetHours))).toBeLessThanOrEqual(5)
    const runsPerWeek = plan.weeks.slice(1, -1).map((w) => plan.sessions.filter((s) => s.weekIndex === w.index && s.sport === 'RUN').length)
    expect(Math.min(...runsPerWeek)).toBeGreaterThanOrEqual(3)
  })

  it('puts the back-to-back on the same weekend as a Sunday long run', () => {
    const plan = generatePlan(request({ profile: aProfile({ availableDays: [0, 2, 4, 5, 6], longRunDay: 6 }) }))
    const backToBacks = plan.sessions.filter((s) => s.type === 'BACK_TO_BACK')
    expect(backToBacks.length).toBeGreaterThan(0)
    expect(backToBacks.every((s) => weekday(s.date) === 5)).toBe(true)
  })
})
