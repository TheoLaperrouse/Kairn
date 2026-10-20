import type { TrainingPhase } from '../../domain/models'

/** Identifying color of each phase (always shown with its label). */
export const PHASE_COLORS: Record<TrainingPhase, string> = {
  BASE: 'var(--zone-2)',
  BUILD: 'var(--zone-3)',
  SPECIFIC: 'var(--accent)',
  TAPER: 'var(--series-form)',
  RACE: 'var(--danger)',
}
