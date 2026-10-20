import { assertDomain } from '../shared/errors'
import { isValidIsoDate, type IsoDate } from '../shared/dates'
import type { ExperienceLevel } from '../athlete/athlete-profile'

/**
 * ITRA-inspired categories, computed on the km-effort
 * (1 km-effort = 1 flat km = 100 m of elevation gain).
 */
export type TrailCategory = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'

export const CATEGORY_LABELS: Record<TrailCategory, string> = {
  XS: 'Trail court',
  S: 'Trail',
  M: 'Trail long',
  L: 'Ultra-trail',
  XL: 'Ultra-trail long',
  XXL: 'Ultra-trail XXL',
}

export interface RaceGoal {
  id: string
  name: string
  raceDate: IsoDate
  distanceKm: number
  elevationGainM: number
  /** 1 = smooth trails … 5 = very technical (scree, hands needed). */
  technicity: 1 | 2 | 3 | 4 | 5
  /** Maximum altitude, for acclimatisation advice. */
  maxAltitudeM?: number
  polesAllowed: boolean
  nightSections: boolean
  /** Optional target time, in hours. */
  targetTimeH?: number
  presetId?: string
}

export function validateGoal(goal: RaceGoal): void {
  assertDomain(goal.name.trim().length > 0, "Le nom de l'objectif est obligatoire")
  assertDomain(isValidIsoDate(goal.raceDate), 'Date de course invalide')
  assertDomain(goal.distanceKm > 0 && goal.distanceKm <= 500, 'Distance hors limites (0-500 km)')
  assertDomain(goal.elevationGainM >= 0 && goal.elevationGainM <= 40_000, 'Dénivelé hors limites')
  assertDomain([1, 2, 3, 4, 5].includes(goal.technicity), 'Technicité entre 1 et 5')
}

export function kmEffort(distanceKm: number, elevationGainM: number): number {
  return distanceKm + elevationGainM / 100
}

export function categorize(goal: Pick<RaceGoal, 'distanceKm' | 'elevationGainM'>): TrailCategory {
  const effort = kmEffort(goal.distanceKm, goal.elevationGainM)
  if (effort < 25) return 'XS'
  if (effort < 45) return 'S'
  if (effort < 75) return 'M'
  if (effort < 115) return 'L'
  if (effort < 155) return 'XL'
  return 'XXL'
}

/** Metres of climbing per kilometre: shows how "vertical" the race is. */
export function verticalRatio(goal: Pick<RaceGoal, 'distanceKm' | 'elevationGainM'>): number {
  return goal.elevationGainM / goal.distanceKm
}

/** Average race speed in km-effort/h over ~50 km-effort, by level. */
const REFERENCE_SPEED: Record<ExperienceLevel, number> = {
  BEGINNER: 5.5,
  INTERMEDIATE: 6.5,
  ADVANCED: 7.5,
  EXPERT: 9,
}

const TECHNICITY_FACTOR = [1.05, 1.02, 1, 0.93, 0.85] as const

/**
 * Race time estimate: km-effort speed decreases with length
 * (Riegel-style power law) and with terrain technicity.
 */
export function estimateRaceDurationH(goal: RaceGoal, level: ExperienceLevel): number {
  if (goal.targetTimeH) return goal.targetTimeH
  const effort = kmEffort(goal.distanceKm, goal.elevationGainM)
  const fatigue = Math.pow(50 / Math.max(effort, 10), 0.08)
  const speed = REFERENCE_SPEED[level] * fatigue * TECHNICITY_FACTOR[goal.technicity - 1]!
  return effort / speed
}

/** Recommended preparation length (weeks) by category. */
export const RECOMMENDED_WEEKS: Record<TrailCategory, number> = {
  XS: 8,
  S: 10,
  M: 12,
  L: 16,
  XL: 20,
  XXL: 24,
}
