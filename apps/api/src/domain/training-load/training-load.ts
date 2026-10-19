import type { AthleteProfile } from '../athlete/athlete-profile'
import type { Activity } from '../activity/activity'
import { ZONE_LOAD_FACTOR, type PlannedSession, type Zone } from '../plan/training-plan'
import { addDays, daysBetween, type IsoDate } from '../shared/dates'

/**
 * Modèle Banister « fitness / fatigue » :
 * - forme de fond (CTL) : moyenne exponentielle sur 42 jours ;
 * - fatigue (ATL) : moyenne exponentielle sur 7 jours ;
 * - fraîcheur (TSB) = CTL − ATL. On vise +5 à +25 le jour de la course.
 */
const CTL_DAYS = 42
const ATL_DAYS = 7

const SPORT_FACTOR = { RUN: 1, BIKE: 0.65, STRENGTH: 0.5 } as const

export interface LoadPoint {
  date: IsoDate
  load: number
  fitness: number
  fatigue: number
  form: number
  projected: boolean
}

/**
 * Charge d'une activité : TRIMP de Banister si la fréquence cardiaque est connue,
 * sinon estimation durée × intensité moyenne, majorée par le dénivelé.
 */
export function activityLoad(activity: Activity, profile: Pick<AthleteProfile, 'hrMax' | 'hrRest'>): number {
  const minutes = activity.durationSec / 60
  const factor = SPORT_FACTOR[activity.sport]
  if (activity.avgHeartRate && profile.hrMax && profile.hrRest && profile.hrMax > profile.hrRest) {
    const reserve = (activity.avgHeartRate - profile.hrRest) / (profile.hrMax - profile.hrRest)
    const ratio = Math.min(Math.max(reserve, 0), 1)
    return Math.round(minutes * ratio * 0.64 * Math.exp(1.92 * ratio) * (activity.sport === 'RUN' ? 1 : factor + 0.2))
  }
  const verticalBonus = activity.sport === 'RUN' ? 1 + Math.min(activity.elevationGainM / 2000, 0.5) : 1
  return Math.round(minutes * 0.8 * factor * verticalBonus)
}

export function plannedLoad(session: PlannedSession): number {
  return Math.round(session.durationMin * ZONE_LOAD_FACTOR[session.zone] * SPORT_FACTOR[session.sport])
}

/** Fraction de FC de réserve au milieu de chaque zone. */
const ZONE_RESERVE: Record<Zone, number> = { 1: 0.55, 2: 0.65, 3: 0.75, 4: 0.85, 5: 0.95 }

/**
 * Charge attendue d'une séance prévue, dans la même échelle que `activityLoad` pour une sortie
 * avec FC : TRIMP calculé sur la FC de réserve moyenne des étapes. Sans FC, l'estimation
 * durée × intensité de `plannedLoad` est déjà dans la bonne échelle.
 */
export function expectedActivityLoad(session: PlannedSession, withHeartRate: boolean): number {
  if (!withHeartRate) return plannedLoad(session)
  const blocks = session.steps.length
    ? session.steps.map((s) => ({ minutes: s.durationMin * (s.repeat ?? 1), zone: s.zone }))
    : [{ minutes: session.durationMin, zone: session.zone }]
  const total = blocks.reduce((sum, b) => sum + b.minutes, 0)
  if (total === 0) return plannedLoad(session)
  const ratio = blocks.reduce((sum, b) => sum + b.minutes * ZONE_RESERVE[b.zone], 0) / total
  const factor = session.sport === 'RUN' ? 1 : SPORT_FACTOR[session.sport] + 0.2
  return Math.round(session.durationMin * ratio * 0.64 * Math.exp(1.92 * ratio) * factor)
}

/**
 * Série quotidienne de charge du `from` au `to` inclus. Les jours postérieurs à `today`
 * utilisent la charge prévue par le plan : on projette la forme jusqu'au jour de course.
 */
export function computeLoadSeries(
  activities: Activity[],
  sessions: PlannedSession[],
  profile: Pick<AthleteProfile, 'hrMax' | 'hrRest'>,
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
): LoadPoint[] {
  const actual = new Map<IsoDate, number>()
  for (const activity of activities) {
    const day = activity.startTime.slice(0, 10)
    actual.set(day, (actual.get(day) ?? 0) + activityLoad(activity, profile))
  }
  const planned = new Map<IsoDate, number>()
  for (const session of sessions) {
    if (session.status === 'SKIPPED') continue
    planned.set(session.date, (planned.get(session.date) ?? 0) + plannedLoad(session))
  }

  const points: LoadPoint[] = []
  let fitness = 0
  let fatigue = 0
  const days = daysBetween(from, to)
  for (let i = 0; i <= days; i++) {
    const date = addDays(from, i)
    const projected = date > today
    const load = projected ? (planned.get(date) ?? 0) : (actual.get(date) ?? 0)
    fitness += (load - fitness) / CTL_DAYS
    fatigue += (load - fatigue) / ATL_DAYS
    points.push({
      date,
      load,
      fitness: round1(fitness),
      fatigue: round1(fatigue),
      form: round1(fitness - fatigue),
      projected,
    })
  }
  return points
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
