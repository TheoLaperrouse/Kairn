import type { TrainingPhase } from '../../domain/models'

/** Couleur d'identification de chaque phase (toujours accompagnée de son libellé). */
export const PHASE_COLORS: Record<TrainingPhase, string> = {
  FONCIER: 'var(--zone-2)',
  DEVELOPPEMENT: 'var(--zone-3)',
  SPECIFIQUE: 'var(--accent)',
  AFFUTAGE: 'var(--series-form)',
  COURSE: 'var(--danger)',
}
