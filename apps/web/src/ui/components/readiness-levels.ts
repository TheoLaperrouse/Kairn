import type { ReadinessLevel } from '../../domain/models'

/** Readiness score light (the color is always paired with its label). */
export const READINESS_LEVELS: Record<ReadinessLevel, { label: string; color: string }> = {
  GREEN: { label: 'Feu vert', color: 'var(--success)' },
  ORANGE: { label: 'Feu orange', color: 'var(--warning)' },
  RED: { label: 'Feu rouge', color: 'var(--danger)' },
}
