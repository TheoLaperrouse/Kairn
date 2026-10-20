import type { TrainingPhase } from '../plan/phase'

export interface RoutineBlock {
  exerciseId: string
  sets: number
  /** Either reps… */
  reps?: number
  /** …or a hold/effort duration. */
  durationSec?: number
  restSec: number
  /** Tempo hint, e.g. "3-1-1" (eccentric-pause-concentric). */
  tempo?: string
  perSide?: boolean
  notes?: string
}

export interface StrengthRoutine {
  id: string
  name: string
  /** Plan phases in which the routine is offered. */
  phases: TrainingPhase[]
  durationMin: number
  focus: string
  description: string
  blocks: RoutineBlock[]
}
