import { assertDomain } from '../shared/errors'

export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'

/** Accessible training terrain: determines the substitutes (stairs, inclined treadmill…). */
export type TerrainAccess = 'MOUNTAINS' | 'HILLS' | 'FLAT'

export interface CrossTrainingPreferences {
  cycling: boolean
  cyclingSessionsPerWeek: 1 | 2
  strength: boolean
  strengthSessionsPerWeek: 1 | 2
}

export interface AthleteProfile {
  name: string
  level: ExperienceLevel
  weightKg?: number
  hrMax?: number
  hrRest?: number
  currentWeeklyKm: number
  currentWeeklyElevationM: number
  /** 0 = Monday … 6 = Sunday. */
  availableDays: number[]
  longRunDay: number
  maxWeeklyHours: number
  terrain: TerrainAccess
  crossTraining: CrossTrainingPreferences
}

export function validateProfile(profile: AthleteProfile): void {
  assertDomain(profile.name.trim().length > 0, 'Le prénom est obligatoire')
  const days = new Set(profile.availableDays)
  assertDomain(days.size === profile.availableDays.length, 'Jours disponibles en double')
  assertDomain([...days].every((d) => Number.isInteger(d) && d >= 0 && d <= 6), 'Jour invalide')
  assertDomain(days.size >= 3, "Il faut au moins 3 jours disponibles pour préparer un trail")
  assertDomain(days.has(profile.longRunDay), 'Le jour de sortie longue doit être un jour disponible')
  assertDomain(profile.maxWeeklyHours >= 3 && profile.maxWeeklyHours <= 30, 'Volume horaire entre 3 et 30 h')
  assertDomain(profile.currentWeeklyKm >= 0, 'Kilométrage hebdomadaire invalide')
  if (profile.hrMax && profile.hrRest) {
    assertDomain(profile.hrMax > profile.hrRest, 'La FC max doit être supérieure à la FC de repos')
  }
}

/** Recommended number of running sessions per week by level. */
export const RUNNING_SESSIONS_BY_LEVEL: Record<ExperienceLevel, number> = {
  BEGINNER: 3,
  INTERMEDIATE: 4,
  ADVANCED: 5,
  EXPERT: 6,
}

/** Average training speed in km-effort/h (easy runs, long runs). */
export const TRAINING_SPEED_KME: Record<ExperienceLevel, number> = {
  BEGINNER: 7,
  INTERMEDIATE: 8,
  ADVANCED: 9,
  EXPERT: 10.5,
}
