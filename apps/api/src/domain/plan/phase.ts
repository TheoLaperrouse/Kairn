export type TrainingPhase = 'FONCIER' | 'DEVELOPPEMENT' | 'SPECIFIQUE' | 'AFFUTAGE' | 'COURSE'

export const PHASE_LABELS: Record<TrainingPhase, string> = {
  FONCIER: 'Foncier',
  DEVELOPPEMENT: 'Développement',
  SPECIFIQUE: 'Spécifique',
  AFFUTAGE: 'Affûtage',
  COURSE: 'Semaine de course',
}
