import { describe, expect, it } from 'vitest'
import { applyUnavailability, lightenSession, rescheduleMissedSessions, type AdaptationContext } from '../../src/domain/plan/plan-adapter'
import { generatePlan } from '../../src/domain/plan/plan-generator'
import type { TrainingPlan } from '../../src/domain/plan/training-plan'
import { addDays } from '../../src/domain/shared/dates'
import { computeReadiness, type CheckIn } from '../../src/domain/wellness/check-in'
import { aGoal, aProfile, routineSummaries } from '../fixtures/factories'

const basePlan = (): TrainingPlan =>
  generatePlan({ planId: 'p', goal: aGoal(), profile: aProfile(), today: '2027-03-01', createdAt: '', routines: routineSummaries })

let counter = 0
const ctx = (today: string): AdaptationContext => ({
  today,
  now: `${today}T07:00:00Z`,
  availableDays: aProfile().availableDays,
  newId: () => `adj-${++counter}`,
})

describe('adaptation du plan', () => {
  it('déplace une séance clé manquée sur un créneau sûr, une seule fois', () => {
    const plan = basePlan()
    const missed = plan.sessions.find((s) => s.keySession && s.sport === 'RUN' && s.date >= '2027-03-08' && s.type !== 'SORTIE_LONGUE')!
    const today = addDays(missed.date, 1)
    const { plan: adapted, adjustment } = rescheduleMissedSessions(plan, ctx(today))
    const moved = adapted.sessions.find((s) => s.id === missed.id)!
    expect(adjustment?.reason).toBe('SEANCE_MANQUEE')
    expect(moved.originalDate).toBe(missed.date)
    expect(moved.date > missed.date || moved.status === 'SKIPPED').toBe(true)
    // Idempotence : un deuxième passage ne change rien.
    expect(rescheduleMissedSessions(adapted, ctx(today)).adjustment).toBeUndefined()
  })

  it('n’enchaîne jamais deux séances dures en rattrapant', () => {
    const plan = basePlan()
    for (const missed of plan.sessions.filter((s) => s.keySession && s.date < '2027-03-20' && s.date >= '2027-03-15')) {
      const { plan: adapted } = rescheduleMissedSessions(plan, ctx(addDays(missed.date, 1)))
      const hardDays = adapted.sessions.filter((s) => s.keySession && s.status === 'PLANNED' && s.date >= '2027-03-15').map((s) => s.date).sort()
      for (let i = 1; i < hardDays.length; i++) expect(hardDays[i]).not.toBe(hardDays[i - 1])
    }
  })

  it('annule les séances pendant une maladie puis organise une reprise progressive sans intensité', () => {
    const plan = basePlan()
    const { plan: adapted, adjustment } = applyUnavailability(
      plan,
      { from: '2027-04-05', to: '2027-04-11', reason: 'MALADIE', crossTrainingOk: false },
      ctx('2027-04-05'),
    )
    const during = adapted.sessions.filter((s) => s.date >= '2027-04-05' && s.date <= '2027-04-11')
    expect(during.every((s) => s.status === 'SKIPPED')).toBe(true)
    const reprise = adapted.sessions.filter((s) => s.date > '2027-04-11' && s.date <= '2027-04-18' && s.status === 'PLANNED' && s.sport === 'RUN')
    expect(reprise.length).toBeGreaterThan(0)
    expect(reprise.every((s) => s.zone <= 2 && !s.keySession)).toBe(true)
    expect(adjustment?.details.join(' ')).toMatch(/annulée/)
    expect(adapted.adjustments?.[0]?.reason).toBe('MALADIE')
  })

  it('remplace la course par du sans-impact en cas de blessure si possible', () => {
    const { plan } = applyUnavailability(basePlan(), { from: '2027-04-05', to: '2027-04-11', reason: 'BLESSURE', crossTrainingOk: true }, ctx('2027-04-05'))
    const during = plan.sessions.filter((s) => s.date >= '2027-04-05' && s.date <= '2027-04-11' && s.type !== 'RENFORCEMENT')
    expect(during.some((s) => s.title === 'Entretien sans impact')).toBe(true)
    expect(during.filter((s) => s.status === 'PLANNED').every((s) => s.sport !== 'RUN')).toBe(true)
  })

  it('allège ou annule une séance suite au bilan du matin, jamais le jour de course', () => {
    const plan = basePlan()
    const hard = plan.sessions.find((s) => s.type === 'SEUIL_MONTEE')!
    const eased = lightenSession(hard, 'ALLEGER')
    expect(eased).toMatchObject({ type: 'ENDURANCE', zone: 2, keySession: false })
    expect(eased.durationMin).toBeLessThan(hard.durationMin)
    expect(lightenSession(hard, 'REPOS').status).toBe('SKIPPED')
    expect(() => lightenSession(plan.sessions.find((s) => s.type === 'COURSE')!, 'REPOS')).toThrow()
  })
})

const good: CheckIn = { date: '2027-03-10', sleepHours: 8, sleepQuality: 5, soreness: 1, fatigue: 1, motivation: 5, stress: 1, restingHr: 48, hrv: 80, illnessSymptoms: false }

describe('bilan du matin', () => {
  it('donne le feu vert quand tout va bien', () => {
    expect(computeReadiness(good, [])).toMatchObject({ level: 'VERT', action: 'AUCUNE', score: 100 })
  })

  it('détecte une FC de repos anormalement haute par rapport à la moyenne personnelle', () => {
    const history = [1, 2, 3, 4, 5].map((d) => ({ ...good, date: addDays(good.date, -d) }))
    const readiness = computeReadiness({ ...good, restingHr: 57, sleepQuality: 3, fatigue: 3 }, history)
    expect(readiness.level).not.toBe('VERT')
    expect(readiness.alerts.join(' ')).toMatch(/FC de repos/)
    expect(readiness.factors[0]!.label).toMatch(/FC de repos/)
  })

  it('conseille le repos en cas de symptômes et de grosse fatigue', () => {
    const readiness = computeReadiness({ ...good, illnessSymptoms: true, fatigue: 4, sleepHours: 5 }, [])
    expect(readiness).toMatchObject({ level: 'ROUGE', action: 'REPOS' })
  })

  it('alerte après trois jours d’affilée sans feu vert', () => {
    const tired = { ...good, fatigue: 4 as const, soreness: 4 as const, sleepQuality: 2 as const }
    const history = [1, 2].map((d) => ({ ...tired, date: addDays(good.date, -d) }))
    expect(computeReadiness({ ...tired, date: good.date }, history).alerts.join(' ')).toMatch(/Trois jours/)
  })
})
