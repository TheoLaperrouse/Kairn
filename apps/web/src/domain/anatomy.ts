/**
 * Groups the catalog's muscle labels into regions that can be drawn on the figure.
 * `anterior` tells which side of the segment the muscle is on (front/back).
 */
export type MuscleRegion = 'ABS' | 'LOWER_BACK' | 'GLUTES' | 'QUADRICEPS' | 'HAMSTRINGS' | 'CALVES' | 'ANKLES' | 'SHOULDERS'

export const REGION_LABELS: Record<MuscleRegion, string> = {
  ABS: 'Sangle abdominale',
  LOWER_BACK: 'Lombaires',
  GLUTES: 'Fessiers',
  QUADRICEPS: 'Quadriceps',
  HAMSTRINGS: 'Ischio-jambiers',
  CALVES: 'Mollets',
  ANKLES: 'Chevilles',
  SHOULDERS: 'Épaules',
}

const RULES: Array<[RegExp, MuscleRegion]> = [
  [/ischio/i, 'HAMSTRINGS'],
  [/quadri|droit fémoral|psoas|fléchisseurs de hanche|genou/i, 'QUADRICEPS'],
  [/fessier|rotateurs de hanche|adducteur/i, 'GLUTES'],
  [/mollet|gastroc|soléaire|achille/i, 'CALVES'],
  [/cheville|péronier/i, 'ANKLES'],
  [/lombaire|érecteur|carré des lombes/i, 'LOWER_BACK'],
  [/transverse|grand droit|oblique|abdo/i, 'ABS'],
  [/épaule|deltoïde/i, 'SHOULDERS'],
]

export function regionsFor(muscles: string[]): MuscleRegion[] {
  const regions = new Set<MuscleRegion>()
  for (const muscle of muscles) {
    const match = RULES.find(([re]) => re.test(muscle))
    if (match) regions.add(match[1])
  }
  return [...regions]
}
