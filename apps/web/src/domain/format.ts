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
  FONCIER: 'Foncier',
  DEVELOPPEMENT: 'Développement',
  SPECIFIQUE: 'Spécifique',
  AFFUTAGE: 'Affûtage',
  COURSE: 'Course',
}

export const LEVEL_LABELS: Record<ExperienceLevel, string> = {
  DEBUTANT: 'Débutant',
  INTERMEDIAIRE: 'Intermédiaire',
  CONFIRME: 'Confirmé',
  EXPERT: 'Expert',
}

export const TERRAIN_LABELS: Record<TerrainAccess, string> = {
  MONTAGNE: 'Montagne',
  COLLINES: 'Collines',
  PLAT: 'Plat',
}

export const SPORT_LABELS: Record<Sport, string> = { RUN: 'Course', BIKE: 'Vélo', STRENGTH: 'Renfo' }

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  ENDURANCE: 'Endurance',
  RECUPERATION: 'Récupération',
  SORTIE_LONGUE: 'Sortie longue',
  BACK_TO_BACK: 'Back-to-back',
  SIMULATION: 'Simulation',
  COTES_COURTES: 'Côtes',
  SEUIL_MONTEE: 'Seuil en montée',
  RANDO_COURSE: 'Rando-course',
  DESCENTE: 'Descente',
  FARTLEK: 'Fartlek',
  RENFORCEMENT: 'Renforcement',
  VELO_ENDURANCE: 'Vélo endurance',
  VELO_FORCE: 'Vélo force',
  COURSE: 'Course',
}

export const ZONE_LABELS: Record<Zone, string> = {
  1: 'Z1 · Récup',
  2: 'Z2 · Endurance',
  3: 'Z3 · Tempo',
  4: 'Z4 · Seuil',
  5: 'Z5 · VMA',
}

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  GAINAGE: 'Gainage',
  FORCE: 'Force',
  EXCENTRIQUE: 'Excentrique',
  PLIOMETRIE: 'Pliométrie',
  PROPRIOCEPTION: 'Proprioception',
  MOBILITE: 'Mobilité',
}

export const RECIPE_CATEGORY_LABELS: Record<RecipeCategory, string> = {
  VEILLE: 'La veille',
  AVANT: 'Avant l’effort',
  PENDANT: 'Pendant l’effort',
  BOISSON: 'Boissons',
  APRES: 'Récupération',
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

/** Chrono `m:ss` pour les minuteurs. */
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

export function todayIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
}

export function weekdayOf(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  CONFORME: 'Conforme au plan',
  TROP_INTENSE: 'Trop intense',
  PAS_ASSEZ_INTENSE: 'Pas assez intense',
  ECOURTEE: 'Écourtée',
  PROLONGEE: 'Prolongée',
  HORS_PLAN: 'Sortie libre',
}

/** Ton d'un verdict : réussi, à surveiller, ou neutre (sortie hors plan). */
export const VERDICT_TONES: Record<Verdict, 'success' | 'warning' | 'neutral'> = {
  CONFORME: 'success',
  TROP_INTENSE: 'warning',
  PAS_ASSEZ_INTENSE: 'warning',
  ECOURTEE: 'warning',
  PROLONGEE: 'warning',
  HORS_PLAN: 'neutral',
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

export function startOfWeekIso(iso: string): string {
  return addDaysIso(iso, -weekdayOf(iso))
}

/** « 3 – 9 mars » ou « 28 févr. – 6 mars ». */
export function formatWeekRange(start: string): string {
  const end = addDaysIso(start, 6)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const day = (iso: string) => String(Number(iso.slice(8, 10)))
  return sameMonth ? `${day(start)} – ${formatShortDate(end)}` : `${formatShortDate(start)} – ${formatShortDate(end)}`
}
