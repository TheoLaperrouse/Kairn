import type {
  ExerciseCategory,
  ExperienceLevel,
  RecipeCategory,
  SessionType,
  Sport,
  TerrainAccess,
  TrainingPhase,
  Verdict,
  Zone,
} from './models'

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const
export const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

export const PHASE_LABELS: Record<TrainingPhase, string> = {
  BASE: 'Foncier',
  BUILD: 'Développement',
  SPECIFIC: 'Spécifique',
  TAPER: 'Affûtage',
  RACE: 'Course',
}

export const LEVEL_LABELS: Record<ExperienceLevel, string> = {
  BEGINNER: 'Débutant',
  INTERMEDIATE: 'Intermédiaire',
  ADVANCED: 'Confirmé',
  EXPERT: 'Expert',
}

export const TERRAIN_LABELS: Record<TerrainAccess, string> = {
  MOUNTAINS: 'Montagne',
  HILLS: 'Collines',
  FLAT: 'Plat',
}

export const SPORT_LABELS: Record<Sport, string> = { RUN: 'Course', BIKE: 'Vélo', STRENGTH: 'Renfo' }

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  ENDURANCE: 'Endurance',
  RECOVERY: 'Récupération',
  LONG_RUN: 'Sortie longue',
  BACK_TO_BACK: 'Back-to-back',
  SIMULATION: 'Simulation',
  HILL_REPEATS: 'Côtes',
  UPHILL_THRESHOLD: 'Seuil en montée',
  HIKE_RUN: 'Rando-course',
  DOWNHILL: 'Descente',
  FARTLEK: 'Fartlek',
  STRENGTH: 'Renforcement',
  BIKE_ENDURANCE: 'Vélo endurance',
  BIKE_STRENGTH: 'Vélo force',
  RACE: 'Course',
}

export const ZONE_LABELS: Record<Zone, string> = {
  1: 'Z1 · Récup',
  2: 'Z2 · Endurance',
  3: 'Z3 · Tempo',
  4: 'Z4 · Seuil',
  5: 'Z5 · VMA',
}

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  CORE: 'Gainage',
  STRENGTH: 'Force',
  ECCENTRIC: 'Excentrique',
  PLYOMETRICS: 'Pliométrie',
  PROPRIOCEPTION: 'Proprioception',
  MOBILITY: 'Mobilité',
}

export const RECIPE_CATEGORY_LABELS: Record<RecipeCategory, string> = {
  DAY_BEFORE: 'La veille',
  BEFORE: 'Avant l’effort',
  DURING: 'Pendant l’effort',
  DRINK: 'Boissons',
  AFTER: 'Récupération',
}

export function formatDuration(minutes: number): string {
  if (minutes > 0 && minutes < 1) return `${Math.round(minutes * 60)} s`
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export function formatSeconds(seconds: number): string {
  return formatDuration(seconds / 60)
}

/** `m:ss` clock for timers. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const shortFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

export function formatShortDate(iso: string): string {
  return shortFormatter.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

export function formatLongDate(iso: string): string {
  return longFormatter.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

export function formatRelative(iso: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - Date.parse(iso)) / 60_000)
  if (minutes < 2) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.round(hours / 24)
  return days === 1 ? 'hier' : `il y a ${days} jours`
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function todayIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
}

export function weekdayOf(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  ON_TARGET: 'Conforme au plan',
  TOO_HARD: 'Trop intense',
  TOO_EASY: 'Pas assez intense',
  CUT_SHORT: 'Écourtée',
  EXTENDED: 'Prolongée',
  UNPLANNED: 'Sortie libre',
}

/** Tone of a verdict: success, warning, or neutral (unplanned outing). */
export const VERDICT_TONES: Record<Verdict, 'success' | 'warning' | 'neutral'> = {
  ON_TARGET: 'success',
  TOO_HARD: 'warning',
  TOO_EASY: 'warning',
  CUT_SHORT: 'warning',
  EXTENDED: 'warning',
  UNPLANNED: 'neutral',
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

export function startOfWeekIso(iso: string): string {
  return addDaysIso(iso, -weekdayOf(iso))
}

/** « 3 – 9 mars » or « 28 févr. – 6 mars ». */
export function formatWeekRange(start: string): string {
  const end = addDaysIso(start, 6)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const day = (iso: string) => String(Number(iso.slice(8, 10)))
  return sameMonth ? `${day(start)} – ${formatShortDate(end)}` : `${formatShortDate(start)} – ${formatShortDate(end)}`
}
