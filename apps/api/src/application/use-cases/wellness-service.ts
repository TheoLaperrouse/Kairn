import type { PlannedSession } from '../../domain/plan/training-plan'
import { addDays, toIsoDate } from '../../domain/shared/dates'
import { computeReadiness, validateCheckIn, type CheckIn, type Readiness } from '../../domain/wellness/check-in'
import type { CheckInRepository, Clock, PlanRepository } from '../ports'

export interface CheckInResult {
  checkIn: CheckIn
  readiness: Readiness
  /** The day's sessions affected by the recommendation (still planned). */
  affectedSessions: PlannedSession[]
}

export interface WellnessOverview {
  today?: CheckInResult
  history: Array<{ date: string; score: number; level: Readiness['level']; restingHr?: number; hrv?: number }>
}

const HISTORY_DAYS = 28

export class WellnessService {
  constructor(
    private readonly checkIns: CheckInRepository,
    private readonly plans: PlanRepository,
    private readonly clock: Clock,
  ) {}

  submit(userId: string, checkIn: CheckIn): CheckInResult {
    validateCheckIn(checkIn)
    this.checkIns.save(userId, checkIn)
    return this.resultFor(userId, checkIn)
  }

  overview(userId: string): WellnessOverview {
    const today = toIsoDate(this.clock.now())
    const all = this.checkIns.listSince(userId, addDays(today, -HISTORY_DAYS - 14))
    const todayCheckIn = all.find((c) => c.date === today)
    return {
      today: todayCheckIn ? this.resultFor(userId, todayCheckIn, all) : undefined,
      history: all
        .filter((c) => c.date >= addDays(today, -HISTORY_DAYS))
        .map((c) => {
          const readiness = computeReadiness(c, all)
          return { date: c.date, score: readiness.score, level: readiness.level, restingHr: c.restingHr, hrv: c.hrv }
        }),
    }
  }

  private resultFor(userId: string, checkIn: CheckIn, history?: CheckIn[]): CheckInResult {
    const past = history ?? this.checkIns.listSince(userId, addDays(checkIn.date, -14))
    const readiness = computeReadiness(checkIn, past)
    const sessions = this.plans.get(userId)?.sessions ?? []
    return {
      checkIn,
      readiness,
      affectedSessions:
        readiness.action === 'NONE'
          ? []
          : sessions.filter((s) => s.date === checkIn.date && s.status === 'PLANNED' && s.type !== 'RACE'),
    }
  }
}
