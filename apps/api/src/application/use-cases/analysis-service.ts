import { analyzeWorkout, type Verdict, type WorkoutAnalysis } from '../../domain/analysis/workout-analysis'
import { NotFoundError } from '../../domain/shared/errors'
import type { Activity } from '../../domain/activity/activity'
import type { ActivityRepository, PlanRepository, ProfileRepository } from '../ports'

type AnalysisContext = Omit<Parameters<typeof analyzeWorkout>[1], 'session'>

/**
 * Analysis of an outing, recomputed on demand: it follows changes to the profile
 * (max / resting HR) and to the plan, without storing anything beyond the track.
 */
export class AnalysisService {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly plans: PlanRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  analyze(userId: string, activityId: string): WorkoutAnalysis {
    const activity = this.activities.get(userId, activityId)
    if (!activity) throw new NotFoundError('Activité', activityId)
    return this.analyzeActivity(userId, activity)
  }

  /** Verdict of each outing, for the list: tracks are read once and shared by every analysis. */
  verdicts(userId: string): Record<string, { verdict: Verdict; score?: number }> {
    const context = this.context(userId)
    return Object.fromEntries(
      context.history.map((activity) => {
        const { verdict, score } = analyze(activity, context)
        return [activity.id, { verdict, score }]
      }),
    )
  }

  analyzeActivity(userId: string, activity: Activity): WorkoutAnalysis {
    return analyze(activity, this.context(userId))
  }

  private context(userId: string): AnalysisContext {
    return {
      profile: this.profiles.get(userId) ?? {},
      sessions: this.plans.get(userId)?.sessions ?? [],
      history: this.activities.list(userId),
    }
  }
}

function analyze(activity: Activity, context: AnalysisContext): WorkoutAnalysis {
  const session = context.sessions.find((s) => s.id === activity.plannedSessionId)
  return analyzeWorkout(activity, { ...context, session })
}
