import { activityDay, type Activity } from '../activity/activity'
import { kmEffort } from '../goal/race-goal'
import { addDays, type IsoDate } from '../shared/dates'
import { clamp, median, round1 } from '../shared/math'

const WINDOW_DAYS = 42
const MIN_DURATION_SEC = 30 * 60
const MIN_RUNS = 3
/** Bornes de vraisemblance : de la rando-course lente au coureur élite. */
const MIN_SPEED = 5
const MAX_SPEED = 14

/**
 * Vitesse d'entraînement réelle en km-effort/h (1 km + 100 m D+) : médiane des sorties à pied
 * d'au moins 30 min sur 6 semaines. Elle remplace la valeur type du niveau pour estimer
 * distance et D+ des séances, qui sont prévues en durée.
 */
export function personalTrainingSpeed(activities: Activity[], today: IsoDate): number | undefined {
  const since = addDays(today, -WINDOW_DAYS)
  const speeds = activities
    .filter((a) => a.sport === 'RUN' && a.durationSec >= MIN_DURATION_SEC && a.distanceKm > 0 && activityDay(a) >= since && activityDay(a) <= today)
    .map((a) => kmEffort(a.distanceKm, a.elevationGainM) / (a.durationSec / 3600))
  if (speeds.length < MIN_RUNS) return undefined
  return round1(clamp(median(speeds)!, MIN_SPEED, MAX_SPEED))
}
