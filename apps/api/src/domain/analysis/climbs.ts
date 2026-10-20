import type { ActivitySample } from '../activity/activity'
import { mean, round2 } from '../shared/math'

/**
 * Splits a track into significant climbs and descents.
 *
 * Peaks and troughs are detected with hysteresis (a flat stretch or a small
 * dip of less than `HYSTERESIS_M` does not break a climb), then
 * portions of at least `MIN_ELEVATION_M` metres are kept. Pauses (aid station, photo at
 * the top) are excluded from the time: VAM reflects moving effort.
 */
export interface Climb {
  startKm: number
  endKm: number
  startAltitudeM: number
  endAltitudeM: number
  /** Net elevation change, positive for a climb. */
  elevationM: number
  /** Moving time. */
  durationSec: number
  gradePct: number
  /** Vertical speed of ascent (climb) or descent, in m/h. */
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
/** Recording gap beyond which we can no longer tell whether the athlete was moving (watch stopped). */
const MAX_INTERVAL_SEC = 300

/** An interval is a pause if there is no forward or upward progress (under 0.5 km/h and 60 m/h). */
function isMoving(a: ActivitySample, b: ActivitySample): boolean {
  const dt = b.t - a.t
  if (dt <= 0 || dt > MAX_INTERVAL_SEC) return false
  const horizontalKmh = ((b.d - a.d) / dt) * 3600
  const verticalMh = a.alt !== undefined && b.alt !== undefined ? (Math.abs(b.alt - a.alt) / dt) * 3600 : 0
  return horizontalKmh >= 0.5 || verticalMh >= 60
}

/** Moving time between samples `from` and `to` (inclusive indices). */
export function movingSeconds(samples: ActivitySample[], from = 0, to = samples.length - 1): number {
  let seconds = 0
  for (let i = from + 1; i <= to; i++) if (isMoving(samples[i - 1]!, samples[i]!)) seconds += samples[i]!.t - samples[i - 1]!.t
  return seconds
}

/** Indices of successive altitude peaks and troughs (hysteresis zigzag). */
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

/** Altitude difference below which two points are at the same level (flat before a climb, pause at the top). */
const LEVEL_TOLERANCE_M = 1

/** A gently rising approach (under 3 % over 200 m) is not part of the climb: it would dilute the VAM. */
const STEEP_GRADE = 0.03
const GRADE_WINDOW_KM = 0.2

function trimGentleEnds(samples: ActivitySample[], from: number, to: number): [number, number] {
  const direction = Math.sign(samples[to]!.alt! - samples[from]!.alt!)
  const steepBetween = (a: number, b: number) => {
    const distanceM = (samples[b]!.d - samples[a]!.d) * 1000
    const rise = ((samples[b]!.alt ?? NaN) - (samples[a]!.alt ?? NaN)) * direction
    return !(rise < STEEP_GRADE * distanceM)
  }
  // Move the start forward while the next 200 m are nearly flat.
  for (;;) {
    let k = from + 1
    while (k < to && samples[k]!.d - samples[from]!.d < GRADE_WINDOW_KM) k++
    if (k >= to || samples[k]!.d - samples[from]!.d < GRADE_WINDOW_KM || steepBetween(from, k)) break
    from++
  }
  // Move the end back while the previous 200 m are nearly flat.
  for (;;) {
    let k = to - 1
    while (k > from && samples[to]!.d - samples[k]!.d < GRADE_WINDOW_KM) k--
    if (k <= from || samples[to]!.d - samples[k]!.d < GRADE_WINDOW_KM || steepBetween(k, to)) break
    to--
  }
  return [from, to]
}

function segment(samples: ActivitySample[], pivotFrom: number, pivotTo: number): Climb | undefined {
  // A portion starts at the last point of the starting flat and ends at the first point of the finishing plateau.
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

/** The week's analyses and VAM baselines often re-read the same tracks. */
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

/** VAM of a set of climbs: cumulative elevation over cumulative time. */
export function aggregateVerticalSpeed(parts: Climb[]): number | undefined {
  const seconds = parts.reduce((s, c) => s + c.durationSec, 0)
  if (seconds === 0) return undefined
  return Math.round((parts.reduce((s, c) => s + Math.abs(c.elevationM), 0) / seconds) * 3600)
}
