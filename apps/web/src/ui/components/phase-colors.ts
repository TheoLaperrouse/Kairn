import type { TrainingPhase } from '../../domain/models'

/** Couleur d'identification de chaque phase (toujours accompagnée de son libellé). */
export const PHASE_COLORS: Record<TrainingPhase, string> = {
  BASE: 'var(--zone-2)',
  BUILD: 'var(--zone-3)',
  SPECIFIC: 'var(--accent)',
  TAPER: 'var(--series-form)',
  RACE: 'var(--danger)',
}
