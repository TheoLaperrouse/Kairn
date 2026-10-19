import type { TrainingPhase } from '../plan/phase'

export interface RoutineBlock {
  exerciseId: string
  sets: number
  /** Soit des répétitions… */
  reps?: number
  /** …soit une durée de maintien/effort. */
  durationSec?: number
  restSec: number
  /** Indication de tempo, ex. "3-1-1" (excentrique-pause-concentrique). */
  tempo?: string
  perSide?: boolean
  notes?: string
}

export interface StrengthRoutine {
  id: string
  name: string
  /** Phases du plan dans lesquelles la routine est proposée. */
  phases: TrainingPhase[]
  durationMin: number
  focus: string
  description: string
  blocks: RoutineBlock[]
}
