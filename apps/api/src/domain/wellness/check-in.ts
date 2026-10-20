import { addDays, isValidIsoDate, type IsoDate } from '../shared/dates'
import { assertDomain } from '../shared/errors'
import { mean } from '../shared/math'

/** Échelle 1 (très mauvais) → 5 (excellent), sauf mention contraire. */
type Scale = 1 | 2 | 3 | 4 | 5

export interface CheckIn {
  date: IsoDate
  sleepHours: number
  sleepQuality: Scale
  /** 1 = aucune courbature … 5 = jambes détruites. */
  soreness: Scale
  /** 1 = en pleine forme … 5 = épuisé. */
  fatigue: Scale
  motivation: Scale
  /** 1 = serein … 5 = très stressé. */
  stress: Scale
  restingHr?: number
  /** VFC (rMSSD, ms) mesurée par la montre ou une appli. */
  hrv?: number
  /** Signes de maladie : gorge, fièvre, nez… */
  illnessSymptoms: boolean
  notes?: string
}

export type ReadinessLevel = 'VERT' | 'ORANGE' | 'ROUGE'

export interface Readiness {
  score: number
  level: ReadinessLevel
  /** Facteurs qui ont pesé, du plus pénalisant au moins pénalisant. */
  factors: Array<{ label: string; impact: number }>
  message: string
  action: 'AUCUNE' | 'ALLEGER' | 'REPOS'
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
 * Score de disponibilité (0-100) à partir des sensations et, si disponibles, de la FC de repos
 * et de la VFC comparées à la moyenne personnelle des 14 derniers jours.
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
  const level: ReadinessLevel = score >= 65 && !checkIn.illnessSymptoms ? 'VERT' : score >= 45 ? 'ORANGE' : 'ROUGE'

  const lastTwo = previous.filter((h) => h.date >= addDays(checkIn.date, -2))
  // Niveau des bilans passés sans comparaison aux références : évite une récursion coûteuse.
  const recentLevels = [...lastTwo.map((h) => computeReadiness(h, []).level), level]
  if (recentLevels.length === 3 && recentLevels.every((l) => l !== 'VERT')) {
    alerts.push('Trois jours d’affilée sans feu vert : signe de surcharge. Envisage une semaine allégée.')
  }

  const action = level === 'VERT' ? 'AUCUNE' : level === 'ORANGE' ? 'ALLEGER' : 'REPOS'
  const message =
    level === 'VERT'
      ? 'Feu vert : la séance prévue est adaptée.'
      : level === 'ORANGE'
        ? 'Feu orange : garde la séance mais en version facile, sans intensité.'
        : 'Feu rouge : aujourd’hui, le repos est l’entraînement le plus efficace.'

  return { score, level, factors: factors.sort((a, b) => b.impact - a.impact), message, action, alerts }
}
