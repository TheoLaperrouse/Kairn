import { addDays, isValidIsoDate, startOfWeek, toIsoDate, weekday, type IsoDate } from '../../domain/shared/dates'
import { DomainError } from '../../domain/shared/errors'
import { buildWeeklySummary, type WeeklySummary } from '../../domain/summary/weekly-summary'
import type { ActivityRepository, CheckInRepository, Clock, GoalRepository, PlanRepository, ProfileRepository } from '../ports'

export class SummaryService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly goals: GoalRepository,
    private readonly plans: PlanRepository,
    private readonly activities: ActivityRepository,
    private readonly checkIns: CheckInRepository,
    private readonly clock: Clock,
  ) {}

  /** Semaine présentée par défaut : celle en cours le dimanche, sinon la précédente (terminée). */
  private defaultWeek(): IsoDate {
    const today = toIsoDate(this.clock.now())
    const current = startOfWeek(today)
    return weekday(today) === 6 ? current : addDays(current, -7)
  }

  weekly(userId: string, weekStart: IsoDate = this.defaultWeek()): WeeklySummary | undefined {
    if (!isValidIsoDate(weekStart) || weekday(weekStart) !== 0) throw new DomainError('La semaine doit commencer un lundi (AAAA-MM-JJ)')
    const today = toIsoDate(this.clock.now())
    if (weekStart > startOfWeek(today)) throw new DomainError('Cette semaine n’a pas encore commencé')
    const profile = this.profiles.get(userId)
    if (!profile) return undefined
    return buildWeeklySummary({
      weekStart,
      today,
      profile,
      goal: this.goals.get(userId),
      plan: this.plans.get(userId),
      activities: this.activities.list(userId),
      checkIns: this.checkIns.listSince(userId, addDays(weekStart, -14)),
    })
  }
}
