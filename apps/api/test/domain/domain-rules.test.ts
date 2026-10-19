import { describe, expect, it } from 'vitest'
import { cumulativeGain, sportFromLabel } from '../../src/domain/activity/activity'
import { matchActivityToSession } from '../../src/domain/activity/session-matcher'
import { describeDevice } from '../../src/domain/account/account'
import { categorize, estimateRaceDurationH, kmEffort } from '../../src/domain/goal/race-goal'
import { computeFuelingPlan } from '../../src/domain/nutrition/race-fueling'
import type { PlannedSession } from '../../src/domain/plan/training-plan'
import { computeLoadSeries } from '../../src/domain/training-load/training-load'
import { aGoal } from '../fixtures/factories'

describe('objectif de course', () => {
  it('calcule le km-effort et la catégorie ITRA', () => {
    expect(kmEffort(101, 6100)).toBe(162)
    expect(categorize({ distanceKm: 101, elevationGainM: 6100 })).toBe('XXL')
    expect(categorize({ distanceKm: 20, elevationGainM: 300 })).toBe('XS')
    expect(categorize({ distanceKm: 57, elevationGainM: 3500 })).toBe('L')
  })

  it('estime un temps de course plus long pour un débutant et un terrain technique', () => {
    const goal = aGoal()
    expect(estimateRaceDurationH(goal, 'DEBUTANT')).toBeGreaterThan(estimateRaceDurationH(goal, 'EXPERT'))
    expect(estimateRaceDurationH({ ...goal, technicity: 5 }, 'INTERMEDIAIRE')).toBeGreaterThan(
      estimateRaceDurationH(goal, 'INTERMEDIAIRE'),
    )
    expect(estimateRaceDurationH({ ...goal, targetTimeH: 24 }, 'INTERMEDIAIRE')).toBe(24)
  })
})

describe('activités', () => {
  it('filtre le bruit altimétrique avec un seuil d’hystérésis', () => {
    expect(cumulativeGain([100, 101, 100, 101, 100, 101])).toBe(0)
    expect(cumulativeGain([100, 110, 105, 120])).toBe(25)
  })

  it('reconnaît le sport depuis les libellés Garmin et Strava', () => {
    expect(sportFromLabel('TrailRun')).toBe('RUN')
    expect(sportFromLabel('cycling road')).toBe('BIKE')
    expect(sportFromLabel('WeightTraining')).toBe('STRENGTH')
  })

  it('associe une activité à la séance du jour du même sport, à la durée la plus proche', () => {
    const base = { weekIndex: 0, objective: '', zone: 2 as const, keySession: false, steps: [], tips: [], status: 'PLANNED' as const }
    const sessions: PlannedSession[] = [
      { ...base, id: 'a', date: '2027-03-02', type: 'ENDURANCE', sport: 'RUN', title: 'EF', durationMin: 45 },
      { ...base, id: 'b', date: '2027-03-02', type: 'SORTIE_LONGUE', sport: 'RUN', title: 'SL', durationMin: 150 },
      { ...base, id: 'c', date: '2027-03-02', type: 'VELO_ENDURANCE', sport: 'BIKE', title: 'Vélo', durationMin: 140 },
    ]
    const match = matchActivityToSession({ sport: 'RUN', startTime: '2027-03-02T07:00:00Z', durationSec: 2.2 * 3600 }, sessions)
    expect(match?.id).toBe('b')
  })
})

describe('charge d’entraînement', () => {
  it('projette la forme à partir des séances prévues après aujourd’hui', () => {
    const base = { weekIndex: 0, objective: '', keySession: false, steps: [], tips: [], status: 'PLANNED' as const, type: 'ENDURANCE' as const, sport: 'RUN' as const, title: '' }
    const sessions: PlannedSession[] = [
      { ...base, id: '1', date: '2027-03-05', durationMin: 120, zone: 3 },
      { ...base, id: '2', date: '2027-03-10', durationMin: 60, zone: 2 },
    ]
    const series = computeLoadSeries([], sessions, {}, '2027-03-01', '2027-03-12', '2027-03-03')
    expect(series).toHaveLength(12)
    expect(series.find((p) => p.date === '2027-03-05')).toMatchObject({ projected: true, load: 120 })
    // Après un gros jour, la fatigue monte plus vite que la forme : fraîcheur négative.
    expect(series.find((p) => p.date === '2027-03-05')!.form).toBeLessThan(0)
  })
})

describe('ravitaillement', () => {
  it('vise 90 g/h pour un intestin entraîné et ajoute caféine et salé sur un ultra', () => {
    const plan = computeFuelingPlan({ durationH: 20, temperatureC: 25, weightKg: 70, sweat: 'MOYEN', gut: 'ENTRAINE' })
    expect(plan.carbsPerHourG).toBe(90)
    expect(plan.hours).toHaveLength(20)
    expect(plan.caffeineMg).toBeGreaterThan(0)
    expect(plan.hours.some((h) => h.suggestion.includes('salé'))).toBe(true)
    expect(plan.sodiumPerHourMg / (plan.fluidPerHourMl / 1000)).toBeGreaterThanOrEqual(500)
  })

  it('proratise la dernière heure entamée', () => {
    const plan = computeFuelingPlan({ durationH: 2.5, temperatureC: 10, weightKg: 70, sweat: 'FAIBLE', gut: 'AUCUN' })
    expect(plan.hours.at(-1)!.carbsG).toBe(30)
  })
})

describe('comptes', () => {
  it('produit un libellé d’appareil lisible', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari/604.1')).toBe('Safari · iOS')
    expect(describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBe('Firefox · Linux')
  })
})
