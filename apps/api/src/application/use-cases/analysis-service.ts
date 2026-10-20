import { analyzeWorkout, type Verdict, type WorkoutAnalysis } from '../../domain/analysis/workout-analysis'
import { NotFoundError } from '../../domain/shared/errors'
import type { Activity } from '../../domain/activity/activity'
import type { ActivityRepository, PlanRepository, ProfileRepository } from '../ports'

type AnalysisContext = Omit<Parameters<typeof analyzeWorkout>[1], 'session'>

/**
 * Analyse d'une sortie, recalculée à la demande : elle suit les changements de profil
 * (FC max / repos) et du plan, sans rien stocker de plus que la trace.
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

  /** Verdict de chaque sortie, pour la liste : une seule lecture des traces, partagée par toutes les analyses. */
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
