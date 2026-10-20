import type { AthleteProfile } from '../athlete/athlete-profile'
import { activityDay, type Activity } from '../activity/activity'
import type { PlannedSession, Sport, Zone } from '../plan/training-plan'
import { addDays, daysBetween, type IsoDate } from '../shared/dates'
import { clamp, round1 } from '../shared/math'

/**
 * Modèle Banister « fitness / fatigue » :
 * - forme de fond (CTL) : moyenne exponentielle sur 42 jours ;
 * - fatigue (ATL) : moyenne exponentielle sur 7 jours ;
 * - fraîcheur (TSB) = CTL − ATL. On vise +5 à +25 le jour de la course.
 */
const CTL_DAYS = 42
const ATL_DAYS = 7

const SPORT_FACTOR = { RUN: 1, BIKE: 0.65, STRENGTH: 0.5 } as const
/** Facteur d'intensité utilisé pour estimer la charge prévue (min × facteur). */
const ZONE_LOAD_FACTOR: Record<Zone, number> = { 1: 0.6, 2: 0.8, 3: 1, 4: 1.25, 5: 1.5 }

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
    return trimp(minutes, clamp(reserve, 0, 1), activity.sport)
  }
  const verticalBonus = activity.sport === 'RUN' ? 1 + Math.min(activity.elevationGainM / 2000, 0.5) : 1
  return Math.round(minutes * 0.8 * factor * verticalBonus)
}

/** TRIMP de Banister pour une fraction de FC de réserve donnée ; vélo et renfo pèsent moins que la course. */
function trimp(minutes: number, reserve: number, sport: Sport): number {
  return Math.round(minutes * reserve * 0.64 * Math.exp(1.92 * reserve) * (sport === 'RUN' ? 1 : SPORT_FACTOR[sport] + 0.2))
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
  return trimp(session.durationMin, ratio, session.sport)
}

/**
 * La charge réalisée se calcule à la FC dès qu'elle est connue (TRIMP), sinon à la durée.
 * La charge prévue doit suivre la même échelle, sinon la projection jusqu'au jour de course
 * mélange deux unités : on retient l'échelle des sorties récentes.
 */
export function usesHeartRateLoad(profile: Pick<AthleteProfile, 'hrMax' | 'hrRest'>, activities: Activity[]): boolean {
  if (!profile.hrMax || !profile.hrRest) return false
  const recent = [...activities]
    .filter((a) => a.sport !== 'STRENGTH')
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, 10)
  return recent.length === 0 || recent.filter((a) => a.avgHeartRate).length * 2 >= recent.length
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
  const heartRateScale = usesHeartRateLoad(profile, activities)
  const actual = new Map<IsoDate, number>()
  for (const activity of activities) {
    const day = activityDay(activity)
    actual.set(day, (actual.get(day) ?? 0) + activityLoad(activity, profile))
  }
  const planned = new Map<IsoDate, number>()
  for (const session of sessions) {
    if (session.status === 'SKIPPED') continue
    planned.set(session.date, (planned.get(session.date) ?? 0) + expectedActivityLoad(session, heartRateScale))
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
