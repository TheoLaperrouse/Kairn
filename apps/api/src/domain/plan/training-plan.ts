import type { IsoDate } from '../shared/dates'
import type { TrainingPhase } from './phase'

export type Sport = 'RUN' | 'BIKE' | 'STRENGTH'

export type SessionType =
  | 'ENDURANCE'
  | 'RECOVERY'
  | 'LONG_RUN'
  | 'BACK_TO_BACK'
  | 'SIMULATION'
  | 'HILL_REPEATS'
  | 'UPHILL_THRESHOLD'
  | 'HIKE_RUN'
  | 'DOWNHILL'
  | 'FARTLEK'
  | 'STRENGTH'
  | 'BIKE_ENDURANCE'
  | 'BIKE_STRENGTH'
  | 'RACE'

export type Zone = 1 | 2 | 3 | 4 | 5

export type SessionStatus = 'PLANNED' | 'DONE' | 'SKIPPED'

export interface WorkoutStep {
  kind: 'WARMUP' | 'EFFORT' | 'RECOVERY' | 'COOLDOWN' | 'CONTINUOUS'
  label: string
  durationMin: number
  repeat?: number
  zone: Zone
  terrain?: string
}

export interface PlannedSession {
  id: string
  weekIndex: number
  date: IsoDate
  type: SessionType
  sport: Sport
  title: string
  objective: string
  durationMin: number
  distanceKm?: number
  elevationGainM?: number
  zone: Zone
  keySession: boolean
  steps: WorkoutStep[]
  tips: string[]
  routineId?: string
  status: SessionStatus
  activityId?: string
  notes?: string
  /** Explication lisible quand Kairn a modifié la séance (déplacée, allégée, remplacée…). */
  adjustment?: string
  /** Date initialement prévue, si la séance a été déplacée. */
  originalDate?: IsoDate
  /** Rôle de la séance dans la préparation : calculé à la lecture, jamais enregistré. */
  purpose?: string
}

export interface PlanWeek {
  index: number
  startDate: IsoDate
  phase: TrainingPhase
  isRecovery: boolean
  targetHours: number
  targetKm: number
  targetElevationM: number
  focus: string
}

export interface TrainingPlan {
  id: string
  goalId: string
  createdAt: string
  startDate: IsoDate
  weeks: PlanWeek[]
  sessions: PlannedSession[]
  warnings: string[]
  /** Journal des adaptations automatiques ou demandées, du plus récent au plus ancien. */
  adjustments?: PlanAdjustment[]
}

export type AdjustmentReason = 'MISSED_SESSION' | 'ILLNESS' | 'INJURY' | 'UNAVAILABLE' | 'FATIGUE'

export interface PlanAdjustment {
  id: string
  createdAt: string
  reason: AdjustmentReason
  summary: string
  details: string[]
}

export const SESSION_SPORT: Record<SessionType, Sport> = {
  ENDURANCE: 'RUN',
  RECOVERY: 'RUN',
  LONG_RUN: 'RUN',
  BACK_TO_BACK: 'RUN',
  SIMULATION: 'RUN',
  HILL_REPEATS: 'RUN',
  UPHILL_THRESHOLD: 'RUN',
  HIKE_RUN: 'RUN',
  DOWNHILL: 'RUN',
  FARTLEK: 'RUN',
  STRENGTH: 'STRENGTH',
  BIKE_ENDURANCE: 'BIKE',
  BIKE_STRENGTH: 'BIKE',
  RACE: 'RUN',
}
