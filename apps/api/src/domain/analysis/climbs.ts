import type { ActivitySample } from '../activity/activity'
import { mean, round2 } from '../shared/math'

/**
 * Découpage d'une trace en montées et descentes significatives.
 *
 * Les sommets et creux sont repérés avec une hystérésis (un replat ou un petit
 * contre-pied de moins de `HYSTERESIS_M` ne coupe pas une montée), puis on garde
 * les portions d'au moins `MIN_ELEVATION_M` mètres. Les pauses (ravito, photo au
 * sommet) sont exclues du temps : la VAM reflète l'effort en mouvement.
 */
export interface Climb {
  startKm: number
  endKm: number
  startAltitudeM: number
  endAltitudeM: number
  /** Dénivelé net, positif pour une montée. */
  elevationM: number
  /** Temps en mouvement. */
  durationSec: number
  gradePct: number
  /** Vitesse ascensionnelle (montée) ou de descente, en m/h. */
  verticalSpeed: number
  avgHeartRate?: number
}

export interface ClimbProfile {
  climbs: Climb[]
  descents: Climb[]
}

const HYSTERESIS_M = 20
const MIN_ELEVATION_M = 50
const MIN_DURATION_SEC = 180
/** Trou d'enregistrement au-delà duquel on ne sait plus si l'on bougeait (montre arrêtée). */
const MAX_INTERVAL_SEC = 300

/** Un intervalle est une pause si l'on n'avance ni ne monte (moins de 0,5 km/h et de 60 m/h). */
function isMoving(a: ActivitySample, b: ActivitySample): boolean {
  const dt = b.t - a.t
  if (dt <= 0 || dt > MAX_INTERVAL_SEC) return false
  const horizontalKmh = ((b.d - a.d) / dt) * 3600
  const verticalMh = a.alt !== undefined && b.alt !== undefined ? (Math.abs(b.alt - a.alt) / dt) * 3600 : 0
  return horizontalKmh >= 0.5 || verticalMh >= 60
}

/** Temps en mouvement entre les échantillons `from` et `to` (indices inclus). */
export function movingSeconds(samples: ActivitySample[], from = 0, to = samples.length - 1): number {
  let seconds = 0
  for (let i = from + 1; i <= to; i++) if (isMoving(samples[i - 1]!, samples[i]!)) seconds += samples[i]!.t - samples[i - 1]!.t
  return seconds
}

/** Indices des sommets et creux successifs de l'altitude (zigzag à hystérésis). */
function turningPoints(samples: ActivitySample[], indices: number[]): number[] {
  const alt = (i: number) => samples[i]!.alt!
  const first = indices[0]!
  const pivots = [first]
  let direction: 1 | -1 | 0 = 0
  let low = first
  let high = first
  let candidate = first
  for (const i of indices.slice(1)) {
    if (direction === 0) {
      if (alt(i) < alt(low)) low = i
      if (alt(i) > alt(high)) high = i
      if (alt(i) - alt(low) >= HYSTERESIS_M) {
        if (low !== first) pivots.push(low)
        direction = 1
        candidate = i
      } else if (alt(high) - alt(i) >= HYSTERESIS_M) {
        if (high !== first) pivots.push(high)
        direction = -1
        candidate = i
      }
    } else if (direction === 1) {
      if (alt(i) >= alt(candidate)) candidate = i
      else if (alt(candidate) - alt(i) >= HYSTERESIS_M) {
        pivots.push(candidate)
        direction = -1
        candidate = i
      }
    } else {
      if (alt(i) <= alt(candidate)) candidate = i
      else if (alt(i) - alt(candidate) >= HYSTERESIS_M) {
        pivots.push(candidate)
        direction = 1
        candidate = i
      }
    }
  }
  if (candidate !== pivots.at(-1)) pivots.push(candidate)
  return pivots
}

/** Écart d'altitude sous lequel deux points sont au même niveau (replat avant une montée, pause au sommet). */
const LEVEL_TOLERANCE_M = 1

/** Une approche en faux plat (moins de 3 % sur 200 m) ne fait pas partie de la montée : elle diluerait la VAM. */
const STEEP_GRADE = 0.03
const GRADE_WINDOW_KM = 0.2

function trimGentleEnds(samples: ActivitySample[], from: number, to: number): [number, number] {
  const direction = Math.sign(samples[to]!.alt! - samples[from]!.alt!)
  const steepBetween = (a: number, b: number) => {
    const distanceM = (samples[b]!.d - samples[a]!.d) * 1000
    const rise = ((samples[b]!.alt ?? NaN) - (samples[a]!.alt ?? NaN)) * direction
    return !(rise < STEEP_GRADE * distanceM)
  }
  // Avance le départ tant que les 200 m suivants sont presque plats.
  for (;;) {
    let k = from + 1
    while (k < to && samples[k]!.d - samples[from]!.d < GRADE_WINDOW_KM) k++
    if (k >= to || samples[k]!.d - samples[from]!.d < GRADE_WINDOW_KM || steepBetween(from, k)) break
    from++
  }
  // Recule l'arrivée tant que les 200 m précédents sont presque plats.
  for (;;) {
    let k = to - 1
    while (k > from && samples[to]!.d - samples[k]!.d < GRADE_WINDOW_KM) k--
    if (k <= from || samples[to]!.d - samples[k]!.d < GRADE_WINDOW_KM || steepBetween(k, to)) break
    to--
  }
  return [from, to]
}

function segment(samples: ActivitySample[], pivotFrom: number, pivotTo: number): Climb | undefined {
  // Une portion commence au dernier point du replat de départ et finit au premier point du palier d'arrivée.
  let from = pivotFrom
  while (from < pivotTo && Math.abs(samples[from + 1]!.alt! - samples[pivotFrom]!.alt!) < LEVEL_TOLERANCE_M) from++
  let to = pivotTo
  while (to > from && Math.abs(samples[to - 1]!.alt! - samples[pivotTo]!.alt!) < LEVEL_TOLERANCE_M) to--
  ;[from, to] = trimGentleEnds(samples, from, to)
  const start = samples[from]!
  const end = samples[to]!
  const elevationM = end.alt! - start.alt!
  const durationSec = movingSeconds(samples, from, to)
  if (Math.abs(elevationM) < MIN_ELEVATION_M || durationSec < MIN_DURATION_SEC) return undefined
  const distanceM = (end.d - start.d) * 1000
  const avgHeartRate = mean(samples.slice(from + 1, to + 1).flatMap((s) => (s.hr === undefined ? [] : [s.hr])))
  return {
    startKm: round2(start.d),
    endKm: round2(end.d),
    startAltitudeM: Math.round(start.alt!),
    endAltitudeM: Math.round(end.alt!),
    elevationM: Math.round(elevationM),
    durationSec: Math.round(durationSec),
    gradePct: distanceM > 0 ? Math.round((elevationM / distanceM) * 1000) / 10 : 0,
    verticalSpeed: Math.round((Math.abs(elevationM) / durationSec) * 3600),
    avgHeartRate: avgHeartRate === undefined ? undefined : Math.round(avgHeartRate),
  }
}

/** Les analyses de la semaine et les références de VAM relisent souvent les mêmes traces. */
const cache = new WeakMap<ActivitySample[], ClimbProfile>()

export function detectClimbs(samples: ActivitySample[]): ClimbProfile {
  const cached = cache.get(samples)
  if (cached) return cached
  const result = computeClimbs(samples)
  cache.set(samples, result)
  return result
}

function computeClimbs(samples: ActivitySample[]): ClimbProfile {
  const withAltitude = samples.flatMap((s, i) => (s.alt === undefined ? [] : [i]))
  if (withAltitude.length < 3) return { climbs: [], descents: [] }
  const pivots = turningPoints(samples, withAltitude)
  const climbs: Climb[] = []
  const descents: Climb[] = []
  for (let k = 1; k < pivots.length; k++) {
    const part = segment(samples, pivots[k - 1]!, pivots[k]!)
    if (part) (part.elevationM > 0 ? climbs : descents).push(part)
  }
  return { climbs, descents }
}

/** VAM d'un ensemble de montées : dénivelé cumulé sur temps cumulé. */
export function aggregateVerticalSpeed(parts: Climb[]): number | undefined {
  const seconds = parts.reduce((s, c) => s + c.durationSec, 0)
  if (seconds === 0) return undefined
  return Math.round((parts.reduce((s, c) => s + Math.abs(c.elevationM), 0) / seconds) * 3600)
}
