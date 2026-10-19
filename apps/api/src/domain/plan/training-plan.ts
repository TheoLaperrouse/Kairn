import type { IsoDate } from '../shared/dates'
import type { TrainingPhase } from './phase'

export type Sport = 'RUN' | 'BIKE' | 'STRENGTH'

export type SessionType =
  | 'ENDURANCE'
  | 'RECUPERATION'
  | 'SORTIE_LONGUE'
  | 'BACK_TO_BACK'
  | 'SIMULATION'
  | 'COTES_COURTES'
  | 'SEUIL_MONTEE'
  | 'RANDO_COURSE'
  | 'DESCENTE'
  | 'FARTLEK'
  | 'RENFORCEMENT'
  | 'VELO_ENDURANCE'
  | 'VELO_FORCE'
  | 'COURSE'

export type Zone = 1 | 2 | 3 | 4 | 5

export type SessionStatus = 'PLANNED' | 'DONE' | 'SKIPPED'

export interface WorkoutStep {
  kind: 'ECHAUFFEMENT' | 'EFFORT' | 'RECUP' | 'RETOUR_CALME' | 'CONTINU'
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

export type AdjustmentReason = 'SEANCE_MANQUEE' | 'MALADIE' | 'BLESSURE' | 'INDISPONIBLE' | 'FATIGUE'

export interface PlanAdjustment {
  id: string
  createdAt: string
  reason: AdjustmentReason
  summary: string
  details: string[]
}

export const SESSION_SPORT: Record<SessionType, Sport> = {
  ENDURANCE: 'RUN',
  RECUPERATION: 'RUN',
  SORTIE_LONGUE: 'RUN',
  BACK_TO_BACK: 'RUN',
  SIMULATION: 'RUN',
  COTES_COURTES: 'RUN',
  SEUIL_MONTEE: 'RUN',
  RANDO_COURSE: 'RUN',
  DESCENTE: 'RUN',
  FARTLEK: 'RUN',
  RENFORCEMENT: 'STRENGTH',
  VELO_ENDURANCE: 'BIKE',
  VELO_FORCE: 'BIKE',
  COURSE: 'RUN',
}

/** Facteur d'intensité utilisé pour estimer la charge prévue (min × facteur). */
export const ZONE_LOAD_FACTOR: Record<Zone, number> = { 1: 0.6, 2: 0.8, 3: 1, 4: 1.25, 5: 1.5 }
