import type { PlannedSession } from '../plan/training-plan'
import type { Activity } from './activity'

/** Fictitious gap that breaks ties between two equivalent matches in favour of the existing one. */
const KEEP_EXISTING_BONUS_MIN = 0.01
/** Beyond this, we stop searching for the optimum (atypical day): order is enough. */
const MAX_ACTIVITIES_PER_DAY = 6

/**
 * Matches a day's activities to the sessions planned that day: same sport, as many
 * matched activities as possible, then the lowest sum of duration gaps.
 * With a double session, the morning run therefore does not take the evening session just
 * because it was imported first.
 */
export function assignDay(
  activities: Array<Pick<Activity, 'id' | 'sport' | 'durationSec' | 'plannedSessionId'>>,
  sessions: PlannedSession[],
): Map<string, string | undefined> {
  const considered = activities.slice(0, MAX_ACTIVITIES_PER_DAY)
  let best = { matched: -1, cost: Infinity, pairs: new Map<string, string>() }
  const used = new Set<string>()
  const pairs = new Map<string, string>()

  const visit = (index: number, matched: number, cost: number) => {
    if (index === considered.length) {
      if (matched > best.matched || (matched === best.matched && cost < best.cost)) best = { matched, cost, pairs: new Map(pairs) }
      return
    }
    const activity = considered[index]!
    for (const session of sessions) {
      if (used.has(session.id) || session.sport !== activity.sport) continue
      const gap = Math.abs(session.durationMin - activity.durationSec / 60)
      used.add(session.id)
      pairs.set(activity.id, session.id)
      visit(index + 1, matched + 1, cost + gap + (session.id === activity.plannedSessionId ? 0 : KEEP_EXISTING_BONUS_MIN))
      pairs.delete(activity.id)
      used.delete(session.id)
    }
    visit(index + 1, matched, cost)
  }
  visit(0, 0, 0)
  return new Map(activities.map((a) => [a.id, best.pairs.get(a.id)]))
}
