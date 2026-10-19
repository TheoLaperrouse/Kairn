import type { Activity, ActivitySample } from '../activity/activity'
import { addDays, startOfWeek, type IsoDate } from '../shared/dates'

/**
 * Courbe de VAM record : meilleure vitesse ascensionnelle tenue pendant 5, 10, 20 et 30 min.
 *
 * Une fenêtre glisse sur la trace : elle trouve le meilleur passage, que la montée soit
 * régulière ou faite de plusieurs rampes. Indépendante du parcours, elle montre si l'on
 * progresse vraiment en côte.
 */
export const VAM_DURATIONS = [5, 10, 20, 30] as const
export type VamDuration = (typeof VAM_DURATIONS)[number]

export interface VamEffort {
  minutes: VamDuration
  /** m/h, sur le dénivelé net de la fenêtre. */
  vam: number
  elevationM: number
  startKm: number
  endKm: number
}

export type VamCurve = Partial<Record<VamDuration, VamEffort>>

/** En dessous, on ne monte pas vraiment : un footing vallonné ne doit pas peser dans la courbe. */
export const MIN_CLIMBING_VAM = 300
/** Une fenêtre qui enjambe un trou d'enregistrement (montre arrêtée) n'est pas un effort continu. */
const MAX_WINDOW_STRETCH = 1.25

/** Meilleure VAM tenue pendant `minutes`, ou `undefined` si la trace ne contient pas un tel effort. */
export function bestVam(samples: ActivitySample[], minutes: VamDuration): VamEffort | undefined {
  const points = samples.filter((s) => s.alt !== undefined)
  const duration = minutes * 60
  let best: VamEffort | undefined
  let j = 0
  for (let i = 0; i < points.length; i++) {
    while (j < points.length && points[j]!.t - points[i]!.t < duration) j++
    if (j >= points.length) break
    const span = points[j]!.t - points[i]!.t
    if (span > duration * MAX_WINDOW_STRETCH) continue
    const elevation = points[j]!.alt! - points[i]!.alt!
    const vam = (elevation / span) * 3600
    if (vam >= MIN_CLIMBING_VAM && (!best || vam > best.vam)) {
      best = {
        minutes,
        vam: Math.round(vam),
        elevationM: Math.round(elevation),
        startKm: Math.round(points[i]!.d * 100) / 100,
        endKm: Math.round(points[j]!.d * 100) / 100,
      }
    }
  }
  return best
}

const cache = new WeakMap<ActivitySample[], VamCurve>()

export function vamCurve(samples: ActivitySample[]): VamCurve {
  const cached = cache.get(samples)
  if (cached) return cached
  const curve: VamCurve = {}
  for (const minutes of VAM_DURATIONS) {
    const effort = bestVam(samples, minutes)
    if (effort) curve[minutes] = effort
  }
  cache.set(samples, curve)
  return curve
}

/** La VAM n'a de sens comparé d'une sortie à l'autre qu'à pied (course, rando). */
function climbingActivities(activities: Activity[]): Activity[] {
  return activities.filter((a) => a.sport === 'RUN' && (a.samples?.length ?? 0) >= 2)
}

/** Records battus par `activity` face aux sorties qui la précèdent (aucun s'il n'y a pas d'antériorité). */
export function vamRecords(activity: Activity, history: Activity[]): Array<{ effort: VamEffort; previous: number }> {
  if (activity.sport !== 'RUN' || !activity.samples?.length) return []
  const curve = vamCurve(activity.samples)
  const before = climbingActivities(history).filter((a) => a.id !== activity.id && a.startTime < activity.startTime)
  return VAM_DURATIONS.flatMap((minutes) => {
    const effort = curve[minutes]
    if (!effort) return []
    const previous = Math.max(0, ...before.map((a) => vamCurve(a.samples!)[minutes]?.vam ?? 0))
    return previous > 0 && effort.vam > previous ? [{ effort, previous }] : []
  })
}

export interface VamMark {
  vam: number
  activityId: string
  activityName: string
  date: IsoDate
}

export interface VamProgress {
  durations: readonly VamDuration[]
  /** Semaines de la plus ancienne à la plus récente, y compris celles sans montée (pour garder l'axe du temps). */
  weeks: Array<{ weekStart: IsoDate; best: Partial<Record<VamDuration, VamMark>> }>
  records: Partial<Record<VamDuration, VamMark>>
  /** Meilleure VAM des 4 dernières semaines face aux 8 semaines précédentes. */
  trend: Partial<Record<VamDuration, { recent?: number; previous?: number; deltaPct?: number }>>
}

const RECENT_WEEKS = 4
const BASELINE_WEEKS = 8

export function buildVamProgress(activities: Activity[], today: IsoDate, weekCount = 26): VamProgress {
  const climbs = climbingActivities(activities)
  const marks = climbs.flatMap((a) => {
    const curve = vamCurve(a.samples!)
    return VAM_DURATIONS.flatMap((minutes) => {
      const effort = curve[minutes]
      return effort ? [{ minutes, mark: { vam: effort.vam, activityId: a.id, activityName: a.name, date: a.startTime.slice(0, 10) } }] : []
    })
  })

  const best = (from: IsoDate, to: IsoDate) => {
    const result: Partial<Record<VamDuration, VamMark>> = {}
    for (const { minutes, mark } of marks) {
      if (mark.date < from || mark.date > to) continue
      if (!result[minutes] || mark.vam > result[minutes]!.vam) result[minutes] = mark
    }
    return result
  }

  const currentWeek = startOfWeek(today)
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const weekStart = addDays(currentWeek, -7 * (weekCount - 1 - i))
    return { weekStart, best: best(weekStart, addDays(weekStart, 6)) }
  })

  const recentStart = addDays(currentWeek, -7 * (RECENT_WEEKS - 1))
  const recent = best(recentStart, today)
  const previous = best(addDays(recentStart, -7 * BASELINE_WEEKS), addDays(recentStart, -1))
  const trend: VamProgress['trend'] = {}
  for (const minutes of VAM_DURATIONS) {
    const r = recent[minutes]?.vam
    const p = previous[minutes]?.vam
    trend[minutes] = { recent: r, previous: p, deltaPct: r && p ? Math.round((r / p - 1) * 1000) / 10 : undefined }
  }

  return { durations: VAM_DURATIONS, weeks, records: best('0000-01-01', '9999-12-31'), trend }
}
