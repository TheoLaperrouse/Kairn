import type { PlannedSession } from '../plan/training-plan'
import type { Activity } from './activity'

/** Écart fictif qui départage deux rattachements équivalents en faveur de celui déjà en place. */
const KEEP_EXISTING_BONUS_MIN = 0.01
/** Au-delà, on ne cherche plus l'optimum (journée atypique) : l'ordre suffit. */
const MAX_ACTIVITIES_PER_DAY = 6

/**
 * Rattache les activités d'une journée aux séances prévues ce jour-là : même sport, le plus
 * d'activités rattachées possible, puis la somme des écarts de durée la plus faible.
 * Avec une double séance, la sortie du matin ne prend donc pas la séance du soir parce
 * qu'elle a été importée la première.
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
