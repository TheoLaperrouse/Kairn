import { analyzeWorkout, type WorkoutAnalysis } from '../../domain/analysis/workout-analysis'
import { NotFoundError } from '../../domain/shared/errors'
import type { Activity } from '../../domain/activity/activity'
import type { ActivityRepository, PlanRepository, ProfileRepository } from '../ports'

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

  analyzeActivity(userId: string, activity: Activity): WorkoutAnalysis {
    const plan = this.plans.get(userId)
    const sessions = plan?.sessions ?? []
    return analyzeWorkout(activity, {
      profile: this.profiles.get(userId) ?? {},
      session: sessions.find((s) => s.id === activity.plannedSessionId),
      sessions,
      history: this.activities.list(userId),
    })
  }
}
