export type TrainingPhase = 'BASE' | 'BUILD' | 'SPECIFIC' | 'TAPER' | 'RACE'

export const PHASE_LABELS: Record<TrainingPhase, string> = {
  BASE: 'Foncier',
  BUILD: 'Développement',
  SPECIFIC: 'Spécifique',
  TAPER: 'Affûtage',
  RACE: 'Semaine de course',
}
