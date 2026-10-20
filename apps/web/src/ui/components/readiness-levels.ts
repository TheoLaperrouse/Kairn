import type { ReadinessLevel } from '../../domain/models'

/** Feu du score de forme (la couleur est toujours doublée de son libellé). */
export const READINESS_LEVELS: Record<ReadinessLevel, { label: string; color: string }> = {
  GREEN: { label: 'Feu vert', color: 'var(--success)' },
  ORANGE: { label: 'Feu orange', color: 'var(--warning)' },
  RED: { label: 'Feu rouge', color: 'var(--danger)' },
}
