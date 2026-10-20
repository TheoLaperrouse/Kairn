import type { Exercise, Pose } from '../../../domain/strength/exercise'
import { STAND, pose, KNEEL_SHIN } from './poses'
import { anchored } from './poses-dynamic'

/** Nordic: straight body tilted by `lean` degrees around the knees, fixed on the ground at x = −0.5. */
const nordic = (lean: number, arms: Partial<Pose>): Pose =>
  pose({
    torso: lean,
    nearThigh: -lean,
    farThigh: -lean,
    nearShin: KNEEL_SHIN,
    farShin: KNEEL_SHIN,
    hipX: -0.5 + Math.sin((lean * Math.PI) / 180),
    ...arms,
  })

/**
 * Alfredson: near forefoot on the edge of the step (h = 0.3), hand on the wall.
 * `foot` = near foot angle (< 90 on tiptoe, > 90 heel below the step); the toes stay on the edge.
 */
const calfStep = (foot: number, overrides: Partial<Pose>): Pose => {
  const rad = (foot * Math.PI) / 180
  // The toe stays at x = 0.3: the ankle moves back as the heel drops.
  const ankleX = 0.3 - 0.3 * Math.sin(rad)
  // The lowest point is the toe (on tiptoe) or the ankle (heel below the step).
  const groundOffset = 0.3 - Math.max(0, -0.3 * Math.cos(rad))
  return pose({
    nearFoot: foot,
    farFoot: foot,
    nearUpperArm: 68,
    nearForearm: 82,
    farUpperArm: 5,
    farForearm: 20,
    hipX: ankleX,
    groundOffset,
    ...overrides,
  })
}

export const ECCENTRIC_EXERCISES: Exercise[] = [
  {
    id: 'squat-excentrique',
    name: 'Squat excentrique lent',
    category: 'ECCENTRIC',
    muscles: ['Quadriceps (excentrique)', 'Grand fessier'],
    equipment: ['Poids du corps', 'Haltères (option)'],
    difficulty: 2,
    description:
      'Squat dont la descente dure 4 à 5 secondes, avec une courte pause en bas, puis une remontée dynamique en 1 seconde.',
    cues: [
      'Compte 4-5 secondes à la descente',
      'Freine activement, ne te laisse pas tomber',
      'Pause d’une seconde en bas, gainé',
      'Remontée explosive',
    ],
    commonMistakes: ['Accélérer en fin de descente', 'Relâcher le gainage en bas', 'Remonter aussi lentement que la descente'],
    trailBenefit:
      "La descente est ce qui détruit les cuisses en ultra : chaque appui en descente est une contraction excentrique. Ce travail réduit les courbatures et l'effondrement des quadriceps après 50 km.",
    regression: 'Descente en 3 secondes, amplitude réduite.',
    progression: 'Goblet squat lesté, ou version unipodale (pistol assisté).',
    // Tempo 3-1-1: braked descent ~3 s (two beats to keep the heels fixed), pause at the bottom, rise ~1 s.
    animation: {
      durationMs: 4400,
      timing: [0, 0.34, 0.68, 0.78, 0.89],
      keyframes: [
        STAND,
        anchored(0, { torso: 18, nearThigh: 42, nearShin: -18, farThigh: 42, farShin: -18, nearUpperArm: 55, nearForearm: 65, farUpperArm: 55, farForearm: 65 }),
        anchored(0, { torso: 42, nearThigh: 84, nearShin: -32, farThigh: 84, farShin: -32, nearUpperArm: 88, nearForearm: 90, farUpperArm: 88, farForearm: 90 }),
        anchored(0, { torso: 42, nearThigh: 84, nearShin: -32, farThigh: 84, farShin: -32, nearUpperArm: 88, nearForearm: 90, farUpperArm: 88, farForearm: 90 }),
        anchored(0, { torso: 20, nearThigh: 40, nearShin: -17, farThigh: 40, farShin: -17, nearUpperArm: 45, nearForearm: 50, farUpperArm: 45, farForearm: 50 }),
      ],
    },
  },
  {
    id: 'step-down-excentrique',
    name: 'Step-down excentrique',
    category: 'ECCENTRIC',
    muscles: ['Quadriceps (excentrique)', 'Moyen fessier', 'Stabilisateurs du genou'],
    equipment: ['Marche ou box basse'],
    difficulty: 2,
    description:
      'Debout sur une marche sur une jambe, descends très lentement l’autre talon vers le sol devant toi en fléchissant la jambe d’appui, effleure le sol puis remonte.',
    cues: [
      'Descente en 3-4 secondes',
      'Genou d’appui aligné sur le 2e orteil',
      'Bassin horizontal, ne te laisse pas tomber sur le talon',
      'Touche le sol du bout du talon, sans transférer le poids',
    ],
    commonMistakes: ['Genou qui rentre vers l’intérieur', 'Hanche libre qui chute', 'Poser le pied et pousser avec'],
    trailBenefit:
      'Simule précisément une marche de descente : renforce le quadriceps en freinage et le contrôle du genou, la meilleure prévention du syndrome rotulien du traileur.',
    regression: 'Marche plus basse (10 cm), main sur un appui.',
    progression: 'Marche plus haute, haltère en main.',
    // Supporting (near) foot fixed on the box; braked descent ~3 s, free heel brushing the ground, rise ~1 s.
    animation: {
      durationMs: 4200,
      timing: [0, 0.36, 0.7, 0.78, 0.9],
      props: [{ kind: 'BOX', x: 0, width: 0.6, height: 0.33 }],
      keyframes: [
        { ...anchored(-0.12, { torso: 4, farThigh: 28, farShin: 12, nearUpperArm: 25, nearForearm: 50, farUpperArm: 25, farForearm: 50 }), groundOffset: 0.33 },
        { ...anchored(-0.12, { torso: 14, nearThigh: 40, nearShin: -20, farThigh: 30, farShin: 30, nearUpperArm: 50, nearForearm: 70, farUpperArm: 50, farForearm: 70 }), groundOffset: 0.322 },
        { ...anchored(-0.12, { torso: 26, nearThigh: 75, nearShin: -35, farThigh: 35, farShin: 54, nearUpperArm: 70, nearForearm: 85, farUpperArm: 70, farForearm: 85 }), groundOffset: 0.002 },
        { ...anchored(-0.12, { torso: 26, nearThigh: 75, nearShin: -35, farThigh: 35, farShin: 54, nearUpperArm: 70, nearForearm: 85, farUpperArm: 70, farForearm: 85 }), groundOffset: 0.002 },
        { ...anchored(-0.12, { torso: 14, nearThigh: 38, nearShin: -19, farThigh: 28, farShin: 26, nearUpperArm: 45, nearForearm: 65, farUpperArm: 45, farForearm: 65 }), groundOffset: 0.33 },
      ],
    },
  },
  {
    id: 'nordic-hamstring',
    name: 'Nordic hamstring',
    category: 'ECCENTRIC',
    muscles: ['Ischio-jambiers (excentrique)', 'Fessiers'],
    equipment: ['Tapis', 'Partenaire ou point d’ancrage pour les chevilles'],
    difficulty: 3,
    description:
      'À genoux, chevilles bloquées. Bascule lentement vers l’avant en gardant le corps droit des genoux à la tête, freine avec les ischios le plus longtemps possible, puis rattrape-toi avec les mains.',
    cues: [
      'Hanches en extension : corps gainé comme une planche',
      'Freine jusqu’au bout, ne casse pas aux hanches',
      'Mains prêtes devant la poitrine',
      'Remonte en poussant légèrement avec les mains',
    ],
    commonMistakes: ['Plier les hanches (fesses en arrière)', 'Se laisser tomber trop tôt', 'Trop de volume au début (grosses courbatures)'],
    trailBenefit:
      "Réduit nettement le risque de lésion des ischio-jambiers, très sollicités en descente rapide et en relance. Un classique de la prévention des blessures.",
    regression: 'Amplitude réduite, ou élastique attaché derrière soi pour assister.',
    progression: 'Tenir 2 secondes à mi-course à chaque répétition.',
    // Knees fixed on the ground, ankles locked: braked fall with a braced body (~3 s), catch on the hands, push back up.
    animation: {
      durationMs: 4600,
      timing: [0, 0.36, 0.7, 0.78, 0.9],
      props: [{ kind: 'MAT', x: 0, width: 3.5 }],
      keyframes: [
        nordic(0, { nearUpperArm: -10, nearForearm: 118, farUpperArm: -10, farForearm: 118 }),
        nordic(38, { nearUpperArm: -25, nearForearm: 118, farUpperArm: -25, farForearm: 118 }),
        nordic(72, { nearUpperArm: -40, nearForearm: 100, farUpperArm: -40, farForearm: 100 }),
        nordic(80, { nearUpperArm: -55, nearForearm: 87, farUpperArm: -55, farForearm: 87 }),
        nordic(45, { nearUpperArm: -20, nearForearm: 80, farUpperArm: -20, farForearm: 80 }),
      ],
    },
  },
  {
    id: 'mollets-excentriques',
    name: 'Mollets excentriques (protocole Alfredson)',
    category: 'ECCENTRIC',
    muscles: ['Gastrocnémiens', 'Soléaire', 'Tendon d’Achille'],
    equipment: ['Marche'],
    difficulty: 2,
    description:
      'Monte sur la pointe avec les deux pieds, transfère le poids sur une seule jambe, puis descends très lentement le talon sous le niveau de la marche. Remonte à deux pieds.',
    cues: ['Montée à deux pieds, descente sur un pied', 'Descente en 3-4 secondes', 'Talon bien sous la marche en bas', 'Fais une série genou tendu puis une genou fléchi'],
    commonMistakes: ['Descendre trop vite', 'Remonter sur une jambe (on veut uniquement l’excentrique)', 'Sauter des séances : la régularité prime'],
    trailBenefit:
      "Protocole de référence pour renforcer le tendon d'Achille, le point faible n°1 du traileur qui augmente son dénivelé.",
    regression: 'Sur sol plat.',
    progression: 'Avec sac lesté.',
    // Rise on both feet, shift onto one foot, slow heel drop below the step (~3 s), back onto both feet.
    animation: {
      durationMs: 5000,
      timing: [0, 0.1, 0.42, 0.7, 0.8, 0.9],
      props: [
        { kind: 'BOX', x: 0.42, width: 0.62, height: 0.3 },
        { kind: 'WALL', x: 1.25 },
      ],
      keyframes: [
        calfStep(58, { farFoot: 58 }),
        calfStep(58, { farThigh: 15, farShin: -75 }),
        calfStep(90, { farThigh: 15, farShin: -75 }),
        calfStep(122, { farThigh: 15, farShin: -75 }),
        calfStep(122, { farFoot: 122 }),
        calfStep(90, { farFoot: 90 }),
      ],
    },
  },
]
