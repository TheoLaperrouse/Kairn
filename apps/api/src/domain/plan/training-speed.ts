import { activityDay, type Activity } from '../activity/activity'
import { kmEffort } from '../goal/race-goal'
import { addDays, type IsoDate } from '../shared/dates'
import { clamp, median, round1 } from '../shared/math'

const WINDOW_DAYS = 42
const MIN_DURATION_SEC = 30 * 60
const MIN_RUNS = 3
/** Plausibility bounds: from slow hike-running to elite runner. */
const MIN_SPEED = 5
const MAX_SPEED = 14

/**
 * Actual training speed in km-effort/h (1 km + 100 m of climbing): median of runs
 * of at least 30 min over 6 weeks. It replaces the level's typical value to estimate
 * the distance and climbing of sessions, which are planned by duration.
 */
export function personalTrainingSpeed(activities: Activity[], today: IsoDate): number | undefined {
  const since = addDays(today, -WINDOW_DAYS)
  const speeds = activities
    .filter((a) => a.sport === 'RUN' && a.durationSec >= MIN_DURATION_SEC && a.distanceKm > 0 && activityDay(a) >= since && activityDay(a) <= today)
    .map((a) => kmEffort(a.distanceKm, a.elevationGainM) / (a.durationSec / 3600))
  if (speeds.length < MIN_RUNS) return undefined
  return round1(clamp(median(speeds)!, MIN_SPEED, MAX_SPEED))
}
