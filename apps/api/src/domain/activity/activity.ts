import type { Sport } from '../plan/training-plan'
import type { IsoDate } from '../shared/dates'
import { mean, round1, round2 } from '../shared/math'

export type ActivitySource = 'FIT' | 'GPX' | 'TCX' | 'STRAVA' | 'GARMIN_FOLDER' | 'MANUAL'

/** Point du profil altimétrique, sous-échantillonné pour l'affichage. */
export interface ProfilePoint {
  distanceKm: number
  altitudeM: number
}

/**
 * Échantillon de la trace, rééchantillonné à pas de temps régulier (voir `resampleTrack`).
 * Clés courtes : une activité de 20 h en compte un millier, stockés avec elle.
 */
export interface ActivitySample {
  /** Secondes écoulées depuis le départ. */
  t: number
  /** Distance cumulée, km. */
  d: number
  alt?: number
  hr?: number
}

export interface Activity {
  id: string
  userId: string
  source: ActivitySource
  /** Identifiant chez le fournisseur ou empreinte du fichier : sert à dédoublonner. */
  externalId: string
  sport: Sport
  name: string
  startTime: string
  /** Jour calendaire du départ dans le fuseau du coureur : une sortie à 0 h 30 compte pour ce jour-là, pas pour la veille en UTC. */
  localDate?: IsoDate
  durationSec: number
  distanceKm: number
  elevationGainM: number
  avgHeartRate?: number
  maxHeartRate?: number
  profile: ProfilePoint[]
  /** Nom généré par Kairn (le nom d'origine était générique) : il suit les changements de rattachement. */
  autoNamed?: boolean
  /**
   * Trace détaillée : absente si elle n'a pas encore été récupérée (Strava),
   * vide si la source n'en fournit pas (activité saisie à la main, renfo sans capteur).
   */
  samples?: ActivitySample[]
  plannedSessionId?: string
}

/** Jour de la sortie ; les activités importées avant l'ajout du jour local retombent sur la date UTC. */
export function activityDay(activity: Pick<Activity, 'startTime' | 'localDate'>): IsoDate {
  return activity.localDate ?? activity.startTime.slice(0, 10)
}

/** Résultat brut d'un parseur ou d'un fournisseur, avant rattachement à un utilisateur. */
export type ImportedActivity = Omit<Activity, 'id' | 'userId' | 'plannedSessionId'>

const SPORT_KEYWORDS: Array<[RegExp, Sport]> = [
  [/(cycl|bik|ride|vélo|velo|ebike|virtualride)/i, 'BIKE'],
  [/(strength|training|weight|musc|renfo|fitness|hiit|workout)/i, 'STRENGTH'],
  [/(run|trail|hik|walk|course|rando)/i, 'RUN'],
]

export function sportFromLabel(label: string | undefined): Sport {
  if (!label) return 'RUN'
  return SPORT_KEYWORDS.find(([re]) => re.test(label))?.[1] ?? 'RUN'
}

/**
 * Réduit un profil à `maxPoints` points en conservant le premier et le dernier.
 */
export function downsampleProfile(points: ProfilePoint[], maxPoints = 200): ProfilePoint[] {
  if (points.length <= maxPoints) return points
  const step = (points.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * step)]!)
}

/** Point brut d'une trace (fichier ou flux Strava), avant rééchantillonnage. */
export interface RawTrackPoint {
  /** Secondes écoulées depuis le départ. */
  t: number
  /** Distance cumulée, km (absente si non mesurée). */
  d?: number
  alt?: number
  hr?: number
}

/** Pas minimal entre deux échantillons et taille maximale de la trace conservée. */
const SAMPLE_MIN_STEP_SEC = 10
const SAMPLE_MAX_POINTS = 1200

/**
 * Rééchantillonne une trace à pas de temps régulier : FC et altitude moyennées sur chaque
 * pas (lisse le bruit du capteur), distance prise en fin de pas. Une sortie de 1 h donne
 * 360 points, un ultra de 20 h 1200 points.
 */
export function resampleTrack(points: RawTrackPoint[]): ActivitySample[] {
  const valid = points.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t)
  if (valid.length < 2) return []
  const start = valid[0]!.t
  const duration = valid.at(-1)!.t - start
  const step = Math.max(SAMPLE_MIN_STEP_SEC, Math.ceil(duration / SAMPLE_MAX_POINTS))

  const samples: ActivitySample[] = []
  let bucket: RawTrackPoint[] = []
  let bucketEnd = step
  let lastDistance = 0
  const flush = (t: number) => {
    if (bucket.length === 0) return
    const alt = mean(bucket.map((p) => p.alt).filter(isFiniteNumber))
    const hr = mean(bucket.map((p) => p.hr).filter((hr): hr is number => isFiniteNumber(hr) && hr > 30 && hr < 240))
    const distance = bucket.map((p) => p.d).filter(isFiniteNumber).at(-1)
    if (distance !== undefined) lastDistance = Math.max(lastDistance, distance)
    samples.push({
      t: Math.round(t),
      d: Math.round(lastDistance * 1000) / 1000,
      ...(alt === undefined ? {} : { alt: round1(alt) }),
      ...(hr === undefined ? {} : { hr: Math.round(hr) }),
    })
    bucket = []
  }
  for (const point of valid) {
    const t = point.t - start
    while (t >= bucketEnd) {
      flush(bucketEnd)
      bucketEnd += step
    }
    bucket.push(point)
  }
  flush(Math.min(bucketEnd, duration))
  return samples
}

export function profileFromSamples(samples: ActivitySample[]): ProfilePoint[] {
  return downsampleProfile(
    samples.filter((s) => s.alt !== undefined).map((s) => ({ distanceKm: round2(s.d), altitudeM: Math.round(s.alt!) })),
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * D+ cumulé avec un seuil d'hystérésis pour filtrer le bruit altimétrique
 * (le GPS seul surestime fortement le dénivelé).
 */
export function cumulativeGain(altitudes: number[], threshold = 3): number {
  let gain = 0
  let reference = altitudes[0]
  if (reference === undefined) return 0
  for (const altitude of altitudes) {
    const delta = altitude - reference
    if (delta >= threshold) {
      gain += delta
      reference = altitude
    } else if (delta <= -threshold) {
      reference = altitude
    }
  }
  return Math.round(gain)
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}
