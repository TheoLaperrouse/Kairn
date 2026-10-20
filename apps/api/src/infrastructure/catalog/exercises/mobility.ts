import type { Exercise } from '../../../domain/strength/exercise'
import { HIP_FLEXOR_LUNGE_ANIMATION, ANKLE_MOBILITY_ANIMATION } from './animations-core-mobility'

export const MOBILITY_EXERCISES: Exercise[] = [
  {
    id: 'fente-psoas',
    name: 'Étirement du psoas en fente basse',
    category: 'MOBILITY',
    muscles: ['Psoas-iliaque', 'Droit fémoral', 'Quadriceps'],
    equipment: ['Tapis ou coussin sous le genou'],
    difficulty: 1,
    description:
      'Genou arrière au sol, pied avant devant. Rétroverse le bassin (rentre les fesses) puis avance doucement les hanches, bras du côté du genou au sol tendu vers le ciel.',
    cues: ['Bassin rentré avant d’avancer', 'Fessier du côté arrière serré', 'Buste droit, légère inclinaison latérale', 'Respire profondément, 30 à 45 secondes'],
    commonMistakes: ['Cambrer le bas du dos au lieu d’ouvrir la hanche', 'Genou avant qui dépasse largement les orteils', 'Rebondir'],
    trailBenefit:
      'Les fléchisseurs de hanche se raccourcissent à force de montées et de marche penchée sur les bâtons : les assouplir libère la foulée et soulage les lombaires.',
    regression: 'Amplitude réduite, mains sur le genou avant.',
    progression: 'Attraper le pied arrière pour étirer aussi le droit fémoral.',
    animation: HIP_FLEXOR_LUNGE_ANIMATION,
  },
  {
    id: 'mobilite-cheville-mur',
    name: 'Mobilité de cheville genou au mur',
    category: 'MOBILITY',
    muscles: ['Soléaire', 'Gastrocnémiens', 'Articulation de la cheville'],
    equipment: ['Mur'],
    difficulty: 1,
    description:
      'En fente basse face à un mur, pied avant à quelques centimètres. Avance le genou vers le mur sans décoller le talon, puis reviens. Recule le pied à mesure que tu gagnes en amplitude.',
    cues: ['Talon avant collé au sol', 'Genou dans l’axe du 2e orteil', 'Mouvement lent, 10 allers-retours', 'Mesure la distance pied-mur pour suivre tes progrès'],
    commonMistakes: ['Talon qui décolle', 'Genou qui part vers l’intérieur', 'Forcer en rebondissant'],
    trailBenefit:
      'Une cheville mobile encaisse mieux les descentes raides et les terrains en dévers ; la flexion de cheville limitée surcharge le genou et le tendon d’Achille.',
    regression: 'Debout, pied avant sur une marche.',
    progression: 'Avec élastique tirant le tibia vers l’arrière.',
    animation: ANKLE_MOBILITY_ANIMATION,
  },
]
