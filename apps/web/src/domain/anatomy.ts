/**
 * Regroupe les libellés de muscles du catalogue en zones dessinables sur le personnage.
 * `anterior` indique de quel côté du segment se trouve le muscle (avant/arrière).
 */
export type MuscleRegion = 'ABDOS' | 'DOS' | 'FESSIERS' | 'QUADRICEPS' | 'ISCHIOS' | 'MOLLETS' | 'CHEVILLES' | 'EPAULES'

export const REGION_LABELS: Record<MuscleRegion, string> = {
  ABDOS: 'Sangle abdominale',
  DOS: 'Lombaires',
  FESSIERS: 'Fessiers',
  QUADRICEPS: 'Quadriceps',
  ISCHIOS: 'Ischio-jambiers',
  MOLLETS: 'Mollets',
  CHEVILLES: 'Chevilles',
  EPAULES: 'Épaules',
}

const RULES: Array<[RegExp, MuscleRegion]> = [
  [/ischio/i, 'ISCHIOS'],
  [/quadri|droit fémoral|psoas|fléchisseurs de hanche|genou/i, 'QUADRICEPS'],
  [/fessier|rotateurs de hanche|adducteur/i, 'FESSIERS'],
  [/mollet|gastroc|soléaire|achille/i, 'MOLLETS'],
  [/cheville|péronier/i, 'CHEVILLES'],
  [/lombaire|érecteur|carré des lombes/i, 'DOS'],
  [/transverse|grand droit|oblique|abdo/i, 'ABDOS'],
  [/épaule|deltoïde/i, 'EPAULES'],
]

export function regionsFor(muscles: string[]): MuscleRegion[] {
  const regions = new Set<MuscleRegion>()
  for (const muscle of muscles) {
    const match = RULES.find(([re]) => re.test(muscle))
    if (match) regions.add(match[1])
  }
  return [...regions]
}
