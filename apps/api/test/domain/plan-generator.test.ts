import { describe, expect, it } from 'vitest'
import { generatePlan, type PlanRequest } from '../../src/domain/plan/plan-generator'
import { weekday } from '../../src/domain/shared/dates'
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
  it('découpe la préparation en phases ordonnées jusqu’à la semaine de course', () => {
    const plan = generatePlan(request())
    const phases = plan.weeks.map((w) => w.phase)
    expect(phases[0]).toBe('FONCIER')
    expect(phases.at(-1)).toBe('COURSE')
    expect(phases.at(-2)).toBe('AFFUTAGE')
    const order = ['FONCIER', 'DEVELOPPEMENT', 'SPECIFIQUE', 'AFFUTAGE', 'COURSE']
    const ranks = phases.map((p) => order.indexOf(p))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('place la course le jour J et la sortie longue sur le jour choisi', () => {
    const plan = generatePlan(request())
    expect(plan.sessions.filter((s) => s.type === 'COURSE').map((s) => s.date)).toEqual(['2027-08-27'])
    const longRuns = plan.sessions.filter((s) => s.type === 'SORTIE_LONGUE')
    expect(longRuns.length).toBeGreaterThan(10)
    expect(longRuns.every((s) => weekday(s.date) === 5)).toBe(true)
  })

  it('programme des back-to-back et une simulation en phase spécifique pour un ultra', () => {
    const plan = generatePlan(request())
    expect(plan.sessions.some((s) => s.type === 'BACK_TO_BACK')).toBe(true)
    expect(plan.sessions.filter((s) => s.type === 'SIMULATION')).toHaveLength(1)
  })

  it('n’ajoute ni vélo ni renforcement quand l’athlète les refuse', () => {
    const profile = aProfile({ crossTraining: { cycling: false, cyclingSessionsPerWeek: 1, strength: false, strengthSessionsPerWeek: 1 } })
    const plan = generatePlan(request({ profile }))
    expect(plan.sessions.some((s) => s.sport === 'BIKE' || s.sport === 'STRENGTH')).toBe(false)
  })

  it('rattache chaque séance de renforcement à une routine adaptée à la phase', () => {
    const plan = generatePlan(request())
    const strength = plan.sessions.filter((s) => s.sport === 'STRENGTH')
    expect(strength.length).toBeGreaterThan(0)
    for (const session of strength) {
      const week = plan.weeks.find((w) => w.index === session.weekIndex)!
      const routine = routineSummaries.find((r) => r.id === session.routineId)!
      expect(routine.phases).toContain(week.phase)
    }
  })

  it('respecte le volume horaire maximum et allège les semaines de récupération', () => {
    const plan = generatePlan(request({ profile: aProfile({ maxWeeklyHours: 8 }) }))
    expect(Math.max(...plan.weeks.map((w) => w.targetHours))).toBeLessThanOrEqual(8)
    const recovery = plan.weeks.find((w) => w.isRecovery)!
    const before = plan.weeks[recovery.index - 1]!
    expect(recovery.targetHours).toBeLessThan(before.targetHours)
  })

  it('ne programme que des jours disponibles (hors course)', () => {
    const plan = generatePlan(request())
    const allowed = new Set(aProfile().availableDays)
    expect(plan.sessions.filter((s) => s.type !== 'COURSE').every((s) => allowed.has(weekday(s.date)))).toBe(true)
  })

  it('signale une préparation trop courte et refuse moins de 4 semaines', () => {
    const short = generatePlan(request({ today: '2027-06-28' }))
    expect(short.warnings.some((w) => w.includes('Préparation courte'))).toBe(true)
    expect(() => generatePlan(request({ today: '2027-08-16' }))).toThrow(/au moins 4 semaines/)
  })

  it('adapte le dénivelé au terrain disponible', () => {
    const flat = generatePlan(request({ profile: aProfile({ terrain: 'PLAT' }) }))
    const mountain = generatePlan(request({ profile: aProfile({ terrain: 'MONTAGNE' }) }))
    const total = (p: typeof flat) => p.weeks.reduce((s, w) => s + w.targetElevationM, 0)
    expect(total(mountain)).toBeGreaterThan(total(flat) * 2)
    expect(flat.warnings.some((w) => w.includes('terrain plat'))).toBe(true)
  })
})
