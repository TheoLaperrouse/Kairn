import type { PlannedSession } from '../plan/training-plan'
import type { Activity } from './activity'

/**
 * Associe une activité réalisée à la séance prévue la plus plausible :
 * même jour, même sport, durée la plus proche, séance encore libre.
 */
export function matchActivityToSession(
  activity: Pick<Activity, 'sport' | 'startTime' | 'durationSec'>,
  sessions: PlannedSession[],
): PlannedSession | undefined {
  const day = activity.startTime.slice(0, 10)
  const durationMin = activity.durationSec / 60
  return sessions
    .filter((s) => s.date === day && s.sport === activity.sport && !s.activityId)
    .sort((a, b) => Math.abs(a.durationMin - durationMin) - Math.abs(b.durationMin - durationMin))[0]
}
