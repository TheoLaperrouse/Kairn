import { activityDay, type Activity } from '../activity/activity'
import { addDays, type IsoDate } from '../shared/dates'

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
    .map((a) => (a.distanceKm + a.elevationGainM / 100) / (a.durationSec / 3600))
    .sort((a, b) => a - b)
  if (speeds.length < MIN_RUNS) return undefined
  const mid = Math.floor(speeds.length / 2)
  const median = speeds.length % 2 ? speeds[mid]! : (speeds[mid - 1]! + speeds[mid]!) / 2
  return Math.round(Math.min(Math.max(median, MIN_SPEED), MAX_SPEED) * 10) / 10
}
