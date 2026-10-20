import { addDays, isValidIsoDate, type IsoDate } from '../shared/dates'
import { assertDomain } from '../shared/errors'
import { mean } from '../shared/math'

/** Scale 1 (very bad) → 5 (excellent), unless stated otherwise. */
type Scale = 1 | 2 | 3 | 4 | 5

export interface CheckIn {
  date: IsoDate
  sleepHours: number
  sleepQuality: Scale
  /** 1 = no soreness … 5 = wrecked legs. */
  soreness: Scale
  /** 1 = full of energy … 5 = exhausted. */
  fatigue: Scale
  motivation: Scale
  /** 1 = calm … 5 = very stressed. */
  stress: Scale
  restingHr?: number
  /** HRV (rMSSD, ms) measured by the watch or an app. */
  hrv?: number
  /** Signs of illness: throat, fever, nose… */
  illnessSymptoms: boolean
  notes?: string
}

export type ReadinessLevel = 'GREEN' | 'ORANGE' | 'RED'

export interface Readiness {
  score: number
  level: ReadinessLevel
  /** Factors that weighed in, from most to least penalising. */
  factors: Array<{ label: string; impact: number }>
  message: string
  action: 'NONE' | 'LIGHTEN' | 'REST'
  alerts: string[]
}

export function validateCheckIn(checkIn: CheckIn): void {
  assertDomain(isValidIsoDate(checkIn.date), 'Date invalide')
  assertDomain(checkIn.sleepHours >= 0 && checkIn.sleepHours <= 16, 'Durée de sommeil entre 0 et 16 h')
  for (const value of [checkIn.sleepQuality, checkIn.soreness, checkIn.fatigue, checkIn.motivation, checkIn.stress]) {
    assertDomain([1, 2, 3, 4, 5].includes(value), 'Les notes vont de 1 à 5')
  }
  if (checkIn.restingHr !== undefined) assertDomain(checkIn.restingHr >= 25 && checkIn.restingHr <= 120, 'FC de repos invalide')
  if (checkIn.hrv !== undefined) assertDomain(checkIn.hrv > 0 && checkIn.hrv <= 300, 'VFC invalide')
}

const BASELINE_DAYS = 14

/**
 * Readiness score (0-100) from how the athlete feels and, when available, resting HR
 * and HRV compared with the personal average of the last 14 days.
 */
export function computeReadiness(checkIn: CheckIn, history: CheckIn[]): Readiness {
  const previous = history
    .filter((h) => h.date < checkIn.date && h.date >= addDays(checkIn.date, -BASELINE_DAYS))
    .sort((a, b) => a.date.localeCompare(b.date))
  const factors: Array<{ label: string; impact: number }> = []
  const penalize = (label: string, impact: number) => {
    if (impact > 0) factors.push({ label, impact: Math.round(impact) })
  }

  penalize('Sommeil court', Math.max(0, 7.5 - checkIn.sleepHours) * 5)
  penalize('Sommeil de mauvaise qualité', (5 - checkIn.sleepQuality) * 3)
  penalize('Courbatures', (checkIn.soreness - 1) * 4)
  penalize('Fatigue ressentie', (checkIn.fatigue - 1) * 5)
  penalize('Motivation en berne', (5 - checkIn.motivation) * 2)
  penalize('Stress', (checkIn.stress - 1) * 2)

  const alerts: string[] = []
  const hrBaseline = mean(previous.map((h) => h.restingHr).filter((v): v is number => v !== undefined))
  if (checkIn.restingHr && hrBaseline && previous.length >= 3) {
    const delta = checkIn.restingHr - hrBaseline
    penalize(`FC de repos +${Math.round(delta)} bpm vs ta moyenne`, Math.max(0, delta - 2) * 3)
    if (delta >= 7) alerts.push('FC de repos nettement plus haute que d’habitude : possible début d’infection ou fatigue profonde.')
  }
  const hrvBaseline = mean(previous.map((h) => h.hrv).filter((v): v is number => v !== undefined))
  if (checkIn.hrv && hrvBaseline && previous.length >= 3) {
    const drop = (hrvBaseline - checkIn.hrv) / hrvBaseline
    penalize(`VFC −${Math.round(drop * 100)} % vs ta moyenne`, Math.max(0, drop - 0.05) * 80)
  }
  if (checkIn.illnessSymptoms) {
    penalize('Symptômes de maladie', 30)
    alerts.push('Symptômes au-dessus du cou (nez, gorge) : footing très léger possible ; en dessous (fièvre, poitrine, courbatures généralisées) : repos complet.')
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - factors.reduce((sum, f) => sum + f.impact, 0))))
  const level: ReadinessLevel = score >= 65 && !checkIn.illnessSymptoms ? 'GREEN' : score >= 45 ? 'ORANGE' : 'RED'

  const lastTwo = previous.filter((h) => h.date >= addDays(checkIn.date, -2))
  // Level of past check-ins without comparison to baselines: avoids a costly recursion.
  const recentLevels = [...lastTwo.map((h) => computeReadiness(h, []).level), level]
  if (recentLevels.length === 3 && recentLevels.every((l) => l !== 'GREEN')) {
    alerts.push('Trois jours d’affilée sans feu vert : signe de surcharge. Envisage une semaine allégée.')
  }

  const action = level === 'GREEN' ? 'NONE' : level === 'ORANGE' ? 'LIGHTEN' : 'REST'
  const message =
    level === 'GREEN'
      ? 'Feu vert : la séance prévue est adaptée.'
      : level === 'ORANGE'
        ? 'Feu orange : garde la séance mais en version facile, sans intensité.'
        : 'Feu rouge : aujourd’hui, le repos est l’entraînement le plus efficace.'

  return { score, level, factors: factors.sort((a, b) => b.impact - a.impact), message, action, alerts }
}
