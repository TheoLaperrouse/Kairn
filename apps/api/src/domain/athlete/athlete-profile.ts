import { assertDomain } from '../shared/errors'

export type ExperienceLevel = 'DEBUTANT' | 'INTERMEDIAIRE' | 'CONFIRME' | 'EXPERT'

/** Terrain d'entraînement accessible : conditionne les substituts (escaliers, tapis incliné…). */
export type TerrainAccess = 'MONTAGNE' | 'COLLINES' | 'PLAT'

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
  /** 0 = lundi … 6 = dimanche. */
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

/** Nombre de séances de course par semaine conseillé selon le niveau. */
export const RUNNING_SESSIONS_BY_LEVEL: Record<ExperienceLevel, number> = {
  DEBUTANT: 3,
  INTERMEDIAIRE: 4,
  CONFIRME: 5,
  EXPERT: 6,
}

/** Vitesse d'entraînement moyenne en km-effort/h (footings, sorties longues). */
export const TRAINING_SPEED_KME: Record<ExperienceLevel, number> = {
  DEBUTANT: 7,
  INTERMEDIAIRE: 8,
  CONFIRME: 9,
  EXPERT: 10.5,
}
