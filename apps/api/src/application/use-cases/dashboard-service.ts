import { activityDay } from '../../domain/activity/activity'
import { CATEGORY_LABELS, categorize, estimateRaceDurationH, kmEffort, type TrailCategory } from '../../domain/goal/race-goal'
import { computeLoadSeries, type LoadPoint } from '../../domain/training-load/training-load'
import type { PlanWeek, PlannedSession } from '../../domain/plan/training-plan'
import { addDays, daysBetween, startOfWeek, toIsoDate, type IsoDate } from '../../domain/shared/dates'
import type { ActivityRepository, Clock, GoalRepository, PlanRepository, ProfileRepository } from '../ports'

export interface WeekVolume {
  weekIndex: number
  startDate: IsoDate
  phase: PlanWeek['phase']
  isRecovery: boolean
  plannedHours: number
  actualHours: number
  plannedKm: number
  actualKm: number
  plannedElevationM: number
  actualElevationM: number
}

export interface Dashboard {
  goal: {
    name: string
    raceDate: IsoDate
    daysToRace: number
    category: TrailCategory
    categoryLabel: string
    kmEffort: number
    estimatedDurationH: number
    distanceKm: number
    elevationGainM: number
  }
  currentWeek?: PlanWeek
  weekSessions: PlannedSession[]
  nextKeySession?: PlannedSession
  volumes: WeekVolume[]
  load: LoadPoint[]
  raceDayForm?: number
  adherence: { done: number; skipped: number; missed: number; total: number }
  warnings: string[]
}

/** Historique de charge affiché avant aujourd'hui. */
const LOAD_HISTORY_DAYS = 42

export class DashboardService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly goals: GoalRepository,
    private readonly plans: PlanRepository,
    private readonly activities: ActivityRepository,
    private readonly clock: Clock,
  ) {}

  get(userId: string): Dashboard | undefined {
    const profile = this.profiles.get(userId)
    const goal = this.goals.get(userId)
    const plan = this.plans.get(userId)
    if (!profile || !goal || !plan) return undefined

    const today = toIsoDate(this.clock.now())
    const activities = this.activities.list(userId)
    const currentWeekStart = startOfWeek(today)
    const currentWeek = plan.weeks.find((w) => w.startDate === currentWeekStart)
    const weekEnd = addDays(currentWeekStart, 6)

    const loadStart = addDays(today, -LOAD_HISTORY_DAYS)
    const loadEnd = goal.raceDate > today ? goal.raceDate : today
    // On amorce la série plus tôt pour que la forme de fond ne parte pas de zéro.
    // La course elle-même est exclue : on veut la fraîcheur au départ, pas après 20 h d'effort.
    const trainingSessions = plan.sessions.filter((s) => s.type !== 'COURSE')
    const load = computeLoadSeries(activities, trainingSessions, profile, addDays(loadStart, -84), loadEnd, today).filter(
      (p) => p.date >= loadStart,
    )

    const past = plan.sessions.filter((s) => s.date < today && s.type !== 'COURSE')
    return {
      goal: {
        name: goal.name,
        raceDate: goal.raceDate,
        daysToRace: daysBetween(today, goal.raceDate),
        category: categorize(goal),
        categoryLabel: CATEGORY_LABELS[categorize(goal)],
        kmEffort: Math.round(kmEffort(goal.distanceKm, goal.elevationGainM)),
        estimatedDurationH: Math.round(estimateRaceDurationH(goal, profile.level) * 10) / 10,
        distanceKm: goal.distanceKm,
        elevationGainM: goal.elevationGainM,
      },
      currentWeek,
      weekSessions: plan.sessions.filter((s) => s.date >= currentWeekStart && s.date <= weekEnd),
      nextKeySession: plan.sessions.find((s) => s.keySession && s.date >= today && s.status === 'PLANNED'),
      volumes: plan.weeks.map((week) => this.volumeOf(week, plan.sessions, activities)),
      load,
      raceDayForm: load.find((p) => p.date === goal.raceDate)?.form,
      adherence: {
        done: past.filter((s) => s.status === 'DONE').length,
        skipped: past.filter((s) => s.status === 'SKIPPED').length,
        missed: past.filter((s) => s.status === 'PLANNED').length,
        total: past.length,
      },
      warnings: plan.warnings,
    }
  }

  private volumeOf(
    week: PlanWeek,
    sessions: PlannedSession[],
    activities: ReturnType<ActivityRepository['list']>,
  ): WeekVolume {
    const end = addDays(week.startDate, 7)
    const done = activities.filter((a) => activityDay(a) >= week.startDate && activityDay(a) < end)
    const runs = done.filter((a) => a.sport === 'RUN')
    const planned = sessions.filter((s) => s.weekIndex === week.index && s.sport !== 'STRENGTH' && s.type !== 'COURSE')
    return {
      weekIndex: week.index,
      startDate: week.startDate,
      phase: week.phase,
      isRecovery: week.isRecovery,
      plannedHours: Math.round(planned.reduce((s, x) => s + x.durationMin, 0) / 6) / 10,
      actualHours: Math.round(done.filter((a) => a.sport !== 'STRENGTH').reduce((s, a) => s + a.durationSec, 0) / 360) / 10,
      plannedKm: week.targetKm,
      actualKm: Math.round(runs.reduce((s, a) => s + a.distanceKm, 0)),
      plannedElevationM: week.targetElevationM,
      actualElevationM: Math.round(runs.reduce((s, a) => s + a.elevationGainM, 0)),
    }
  }
}
