import { validateProfile, type AthleteProfile } from '../../domain/athlete/athlete-profile'
import { RACE_PRESETS, type RacePreset } from '../../domain/goal/race-presets'
import { validateGoal, type RaceGoal } from '../../domain/goal/race-goal'
import {
  applyUnavailability,
  lightenSession,
  rescheduleMissedSessions,
  type AdaptationContext,
  type LightenMode,
  type Unavailability,
} from '../../domain/plan/plan-adapter'
import { generatePlan } from '../../domain/plan/plan-generator'
import { sessionPurpose, withPurposes } from '../../domain/plan/session-purpose'
import { personalTrainingSpeed } from '../../domain/plan/training-speed'
import type { PlanAdjustment, PlannedSession, SessionStatus, TrainingPlan } from '../../domain/plan/training-plan'
import { toIsoDate, type IsoDate } from '../../domain/shared/dates'
import { DomainError, NotFoundError } from '../../domain/shared/errors'
import type { ActivityRepository, Clock, ContentCatalog, GoalRepository, IdGenerator, PlanRepository, ProfileRepository } from '../ports'

export class TrainingService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly goals: GoalRepository,
    private readonly plans: PlanRepository,
    private readonly catalog: ContentCatalog,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly activities: ActivityRepository,
  ) {}

  presets(): RacePreset[] {
    return RACE_PRESETS
  }

  getProfile(userId: string): AthleteProfile | undefined {
    return this.profiles.get(userId)
  }

  saveProfile(userId: string, profile: AthleteProfile): AthleteProfile {
    validateProfile(profile)
    this.profiles.save(userId, profile)
    return profile
  }

  getGoal(userId: string): RaceGoal | undefined {
    return this.goals.get(userId)
  }

  saveGoal(userId: string, input: Omit<RaceGoal, 'id'> & { id?: string }): RaceGoal {
    const goal: RaceGoal = { ...input, id: input.id ?? this.ids.next() }
    validateGoal(goal)
    this.goals.save(userId, goal)
    return goal
  }

  /** (Re)generates the plan from the current goal and profile, keeping sessions already done. */
  regeneratePlan(userId: string): TrainingPlan {
    const profile = this.profiles.get(userId)
    const goal = this.goals.get(userId)
    if (!profile || !goal) throw new DomainError('Renseigne ton profil et ton objectif avant de générer un plan')

    const now = this.clock.now()
    const plan = generatePlan({
      planId: this.ids.next(),
      goal,
      profile,
      today: toIsoDate(now),
      createdAt: now.toISOString(),
      routines: this.catalog.routines(),
      trainingSpeedKme: personalTrainingSpeed(this.activities.list(userId), toIsoDate(now)),
    })
    const merged = withHistory(plan, this.plans.get(userId), toIsoDate(now))
    this.plans.save(userId, merged)
    return this.explained(userId, merged)
  }

  getPlan(userId: string): TrainingPlan | undefined {
    const plan = this.plans.get(userId)
    return plan && this.explained(userId, plan)
  }

  getSession(userId: string, sessionId: string): PlannedSession {
    return this.explainedSession(userId, this.storedSession(userId, sessionId))
  }

  updateSession(userId: string, sessionId: string, change: { status?: SessionStatus; notes?: string }): PlannedSession {
    const session = this.storedSession(userId, sessionId)
    const updated: PlannedSession = {
      ...session,
      ...(change.status ? { status: change.status } : {}),
      ...(change.notes !== undefined ? { notes: change.notes.slice(0, 2000) } : {}),
    }
    this.plans.updateSession(userId, updated)
    return this.explainedSession(userId, updated)
  }

  /**
   * Catches up on recently missed key sessions. Idempotent: a session already
   * handled (moved or dropped) is never handled twice.
   */
  adaptPlan(userId: string): PlanAdjustment | undefined {
    const plan = this.plans.get(userId)
    if (!plan) return undefined
    const { plan: adapted, adjustment } = rescheduleMissedSessions(plan, this.adaptationContext(userId))
    if (adjustment) this.plans.save(userId, adapted)
    return adjustment
  }

  declareUnavailability(userId: string, period: Unavailability): TrainingPlan {
    const plan = this.requirePlan(userId)
    const { plan: adapted } = applyUnavailability(plan, period, this.adaptationContext(userId))
    this.plans.save(userId, adapted)
    return this.explained(userId, adapted)
  }

  lightenSession(userId: string, sessionId: string, mode: LightenMode): PlannedSession {
    const plan = this.requirePlan(userId)
    const session = plan.sessions.find((s) => s.id === sessionId)
    if (!session) throw new NotFoundError('Séance', sessionId)
    const lightened = lightenSession(session, mode)
    const adjustment: PlanAdjustment = {
      id: this.ids.next(),
      createdAt: this.clock.now().toISOString(),
      reason: 'FATIGUE',
      summary: mode === 'REST' ? `Repos à la place de « ${session.title} »` : `« ${session.title} » allégée`,
      details: [lightened.adjustment ?? ''],
    }
    this.plans.save(userId, {
      ...plan,
      sessions: plan.sessions.map((s) => (s.id === sessionId ? lightened : s)),
      adjustments: [adjustment, ...(plan.adjustments ?? [])],
    })
    return this.explainedSession(userId, lightened)
  }

  private storedSession(userId: string, sessionId: string): PlannedSession {
    const session = this.plans.get(userId)?.sessions.find((s) => s.id === sessionId)
    if (!session) throw new NotFoundError('Séance', sessionId)
    return session
  }

  private explained(userId: string, plan: TrainingPlan): TrainingPlan {
    return withPurposes(plan, this.goals.get(userId), this.profiles.get(userId))
  }

  private explainedSession(userId: string, session: PlannedSession): PlannedSession {
    const plan = this.plans.get(userId)
    const goal = this.goals.get(userId)
    const profile = this.profiles.get(userId)
    return plan && goal && profile ? { ...session, purpose: sessionPurpose(session, plan, goal, profile) } : session
  }

  private requirePlan(userId: string): TrainingPlan {
    const plan = this.plans.get(userId)
    if (!plan) throw new DomainError('Aucun plan : génère-le d’abord')
    return plan
  }

  private adaptationContext(userId: string): AdaptationContext {
    const now = this.clock.now()
    return {
      today: toIsoDate(now),
      now: now.toISOString(),
      availableDays: this.profiles.get(userId)?.availableDays ?? [0, 1, 2, 3, 4, 5, 6],
      newId: () => this.ids.next(),
    }
  }
}

/**
 * Keeps the old plan's history (past weeks and sessions) ahead of the new one,
 * so tracking is not lost when the goal or availability changes along the way.
 * A session already done or skipped today stays too, in place of the new one of the same sport.
 */
function withHistory(plan: TrainingPlan, previous: TrainingPlan | undefined, today: IsoDate): TrainingPlan {
  if (!previous) return plan
  const pastWeeks = previous.weeks.filter((w) => w.startDate < plan.startDate)
  const firstNewDate = plan.sessions[0]?.date ?? plan.startDate
  const shift = pastWeeks.length
  const reindexed = new Map(pastWeeks.map((w, i) => [w.index, i]))
  const settledToday = new Set(previous.sessions.filter((s) => s.date === today && s.status !== 'PLANNED').map((s) => s.sport))
  const newSessions = plan.sessions.filter((s) => s.date !== today || !settledToday.has(s.sport))
  const pastSessions = previous.sessions
    .filter((s) => s.date < firstNewDate || (s.date === today && s.status !== 'PLANNED'))
    .map((s) => ({ ...s, weekIndex: s.date >= plan.startDate ? shift : (reindexed.get(s.weekIndex) ?? 0) }))
  return {
    ...plan,
    adjustments: previous.adjustments,
    startDate: pastWeeks[0]?.startDate ?? plan.startDate,
    weeks: [...pastWeeks.map((w, i) => ({ ...w, index: i })), ...plan.weeks.map((w) => ({ ...w, index: w.index + shift }))],
    sessions: [...pastSessions, ...newSessions.map((s) => ({ ...s, weekIndex: s.weekIndex + shift }))],
  }
}
