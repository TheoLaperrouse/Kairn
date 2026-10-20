import type { AthleteProfile } from '../athlete/athlete-profile'
import type { ActivitySample } from '../activity/activity'
import type { Zone } from '../plan/training-plan'

/**
 * 5-level heart rate zones, aligned with those of the plan's sessions (Z1 recovery → Z5 VO2max).
 * - Karvonen method (% of heart rate reserve) when resting HR is known: more accurate;
 * - otherwise % of max HR, like watches by default.
 */
export type ZoneMethod = 'RESERVE' | 'MAX'

export interface HeartRateZones {
  method: ZoneMethod
  /** Lower bound (bpm) of Z2, Z3, Z4 and Z5. */
  bounds: [number, number, number, number]
}

export type TimeInZones = Record<Zone, number>

const THRESHOLDS = [0.6, 0.7, 0.8, 0.9] as const
/**
 * Beyond this, the gap between two samples is a pause (watch stopped): it does not count.
 * Wide enough for sparse recordings (UltraTrac mode: one point per minute).
 */
const MAX_INTERVAL_SEC = 120

export function heartRateZones(profile: Pick<AthleteProfile, 'hrMax' | 'hrRest'>): HeartRateZones | undefined {
  const { hrMax, hrRest } = profile
  if (!hrMax) return undefined
  if (hrRest && hrRest < hrMax) {
    return { method: 'RESERVE', bounds: THRESHOLDS.map((p) => Math.round(hrRest + p * (hrMax - hrRest))) as HeartRateZones['bounds'] }
  }
  return { method: 'MAX', bounds: THRESHOLDS.map((p) => Math.round(p * hrMax)) as HeartRateZones['bounds'] }
}

export function zoneOf(heartRate: number, zones: HeartRateZones): Zone {
  let zone: Zone = 1
  zones.bounds.forEach((bound, i) => {
    if (heartRate >= bound) zone = (i + 2) as Zone
  })
  return zone
}

/** Seconds spent in each zone, weighted by the interval between samples. */
export function timeInZones(samples: ActivitySample[], zones: HeartRateZones): TimeInZones {
  const time: TimeInZones = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i]!
    const dt = sample.t - samples[i - 1]!.t
    if (sample.hr === undefined || dt <= 0 || dt > MAX_INTERVAL_SEC) continue
    time[zoneOf(sample.hr, zones)] += dt
  }
  return time
}

export function totalSeconds(time: TimeInZones): number {
  return time[1] + time[2] + time[3] + time[4] + time[5]
}

export function shareAtOrAbove(time: TimeInZones, zone: number): number {
  const total = totalSeconds(time)
  if (total === 0) return 0
  let above = 0
  for (let z = Math.max(zone, 1); z <= 5; z++) above += time[z as Zone]
  return above / total
}
