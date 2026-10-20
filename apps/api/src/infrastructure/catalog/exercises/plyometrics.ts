import type { Exercise, Pose } from '../../../domain/strength/exercise'
import { pose } from './poses'
import { anchored, swapSides } from './poses-dynamic'

/** Fentes sautées, demi-cycle (jambe proche devant) ; le second demi-cycle est symétrique. */
const JUMP_LUNGE: Pose[] = [
  pose({ nearThigh: 85, nearShin: 0, farThigh: -15, farShin: -100, nearUpperArm: -35, nearForearm: -10, farUpperArm: 50, farForearm: 80 }),
  // Poussée : angles résolus pour que la cheville avant et la pointe arrière restent à leur place.
  { ...pose({ torso: 4, nearThigh: 60, nearShin: 5, farThigh: -30, farShin: -69, farFoot: 20, nearUpperArm: -10, nearForearm: 20, farUpperArm: 30, farForearm: 60 }), hipX: 0.043 },
  { ...pose({ nearThigh: 25, nearShin: -10, farThigh: 5, farShin: -30, nearFoot: 60, farFoot: 50, nearUpperArm: 10, nearForearm: 40, farUpperArm: 10, farForearm: 40 }), air: 0.38 },
  { ...pose({ nearThigh: -12, nearShin: -48, farThigh: 62, farShin: 4, nearFoot: 30, farFoot: 80, nearUpperArm: 40, nearForearm: 70, farUpperArm: -25, farForearm: 0 }), air: 0.1 },
]

/** Foulées bondissantes, demi-cycle : contact (pied proche), amorti, poussée, vol. */
const BOUND: Pose[] = [
  pose({ torso: 8, nearThigh: 22, nearShin: 4, nearFoot: 82, farThigh: -25, farShin: -95, nearUpperArm: -45, nearForearm: -10, farUpperArm: 55, farForearm: 110 }),
  pose({ torso: 10, nearThigh: 0, nearShin: -18, farThigh: 35, farShin: -40, nearUpperArm: -10, nearForearm: 20, farUpperArm: 25, farForearm: 70 }),
  pose({ torso: 12, nearThigh: -32, nearShin: -38, nearFoot: 25, farThigh: 80, farShin: 8, farFoot: 95, nearUpperArm: 55, nearForearm: 110, farUpperArm: -45, farForearm: -10 }),
  { ...pose({ torso: 10, nearThigh: -30, nearShin: -75, nearFoot: 15, farThigh: 70, farShin: 25, farFoot: 92, nearUpperArm: 55, nearForearm: 110, farUpperArm: -45, farForearm: -10 }), air: 0.35 },
]

/** Skipping, demi-cycle : genou proche haut, appui avant-pied éloigné, puis transition aérienne. */
const SKIP: Pose[] = [
  pose({ torso: 6, nearThigh: 88, nearShin: -5, nearFoot: 100, farThigh: -4, farShin: -4, farFoot: 62, nearUpperArm: -35, nearForearm: 30, farUpperArm: 50, farForearm: 140 }),
  { ...pose({ torso: 6, nearThigh: 12, nearShin: 2, nearFoot: 70, farThigh: 35, farShin: -30, farFoot: 45, nearUpperArm: 10, nearForearm: 80, farUpperArm: 10, farForearm: 80 }), air: 0.04 },
]

export const PLYOMETRIC_EXERCISES: Exercise[] = [
  {
    id: 'squat-jump',
    name: 'Squat jump',
    category: 'PLYOMETRICS',
    muscles: ['Quadriceps', 'Fessiers', 'Mollets'],
    equipment: ['Poids du corps'],
    difficulty: 2,
    description:
      'Depuis la position de squat, saute le plus haut possible en lançant les bras, puis réceptionne-toi en douceur en amortissant directement dans un nouveau squat.',
    cues: ['Extension complète chevilles-genoux-hanches', 'Les bras lancent le saut', 'Réception silencieuse sur l’avant-pied', 'Genoux dans l’axe à l’atterrissage'],
    commonMistakes: ['Réception jambes tendues et bruyante', 'Genoux qui rentrent à l’atterrissage', 'Enchaîner sans qualité quand la fatigue arrive'],
    trailBenefit:
      'Développe la puissance et la raideur musculo-tendineuse : foulée plus économique et relances plus vives sur les portions roulantes.',
    regression: 'Petits sauts avec pause entre chaque répétition.',
    progression: 'Enchaînement réactif sans pause, ou gilet lesté léger.',
    // Charge bras en arrière → triple extension sur la pointe, bras au ciel → vol → réception avant-pied → amorti.
    animation: {
      durationMs: 2000,
      timing: [0, 0.16, 0.33, 0.5, 0.66],
      keyframes: [
        anchored(0, { torso: 45, nearThigh: 85, nearShin: -33, farThigh: 85, farShin: -33, nearUpperArm: -45, nearForearm: -20, farUpperArm: -45, farForearm: -20 }),
        anchored(0.088, { torso: 12, nearThigh: 8, nearShin: 2, farThigh: 8, farShin: 2, nearFoot: 45, farFoot: 45, nearUpperArm: 160, nearForearm: 168, farUpperArm: 160, farForearm: 168 }),
        { ...pose({ torso: 4, nearFoot: 50, farFoot: 50, nearUpperArm: 172, nearForearm: 176, farUpperArm: 172, farForearm: 176 }), hipX: 0.088, air: 0.5 },
        anchored(0.028, { torso: 10, nearThigh: 12, nearShin: -4, farThigh: 12, farShin: -4, nearFoot: 65, farFoot: 65, nearUpperArm: 105, nearForearm: 115, farUpperArm: 105, farForearm: 115 }),
        anchored(0, { torso: 38, nearThigh: 76, nearShin: -30, farThigh: 76, farShin: -30, nearUpperArm: 70, nearForearm: 80, farUpperArm: 70, farForearm: 80 }),
      ],
    },
  },
  {
    id: 'fentes-sautees',
    name: 'Fentes sautées',
    category: 'PLYOMETRICS',
    muscles: ['Quadriceps', 'Fessiers', 'Fléchisseurs de hanche'],
    equipment: ['Poids du corps'],
    difficulty: 3,
    description:
      'Depuis une position de fente, saute et inverse les jambes en l’air pour atterrir dans la fente opposée, en amortissant.',
    cues: ['Buste droit pendant tout le mouvement', 'Bras opposés aux jambes comme en course', 'Atterrissage amorti, genou arrière ne touche pas le sol', 'Qualité avant quantité'],
    commonMistakes: ['Fente trop courte', 'Atterrissage sur les talons', 'Buste qui s’effondre en fin de série'],
    trailBenefit:
      'Puissance unilatérale et coordination : prépare les cuisses aux appuis dynamiques et alternés des sentiers cassants.',
    regression: 'Fentes alternées sans saut, rapides.',
    progression: 'Enchaînement sans pause, plus d’amplitude.',
    // Fente → poussée → ciseau en l'air → réception dans la fente opposée, bras opposés aux jambes.
    animation: {
      repsPerCycle: 2,
      durationMs: 2200,
      timing: [0, 0.12, 0.25, 0.37, 0.5, 0.62, 0.75, 0.87],
      keyframes: [...JUMP_LUNGE, ...JUMP_LUNGE.map(swapSides)],
    },
  },
  {
    id: 'bondissements',
    name: 'Foulées bondissantes',
    category: 'PLYOMETRICS',
    muscles: ['Mollets', 'Fessiers', 'Quadriceps', 'Fléchisseurs de hanche'],
    equipment: ['Ligne droite de 30-50 m (idéalement légère montée)'],
    difficulty: 3,
    description:
      'Course exagérée : à chaque foulée, pousse fort sur la jambe d’appui pour rester longtemps en l’air, genou avant haut, bras opposé actif.',
    cues: ['Poussée complète de la jambe arrière', 'Genou libre monte vers l’horizontale', 'Bras opposé en balancier ample', 'Pose le pied sous le centre de gravité'],
    commonMistakes: ['Chercher la vitesse plutôt que la hauteur/amplitude', 'Contacts au sol longs et écrasés', 'Trop de répétitions (qualité qui chute)'],
    trailBenefit:
      'La séance « magique » des montées : améliore la force réactive des mollets et la poussée de hanche utilisées dans les côtes courantes.',
    regression: 'Skipping amplitude, sans phase de vol marquée.',
    progression: 'En côte légère (5-8 %).',
    // Course bondissante sur place : contact → amorti → poussée complète → long temps de vol, bras opposé en balancier.
    animation: {
      repsPerCycle: 2,
      durationMs: 1500,
      timing: [0, 0.13, 0.26, 0.38, 0.5, 0.63, 0.76, 0.88],
      keyframes: [...BOUND, ...BOUND.map(swapSides)],
    },
  },
  {
    id: 'sauts-sur-box',
    name: 'Sauts sur box',
    category: 'PLYOMETRICS',
    muscles: ['Quadriceps', 'Fessiers', 'Mollets'],
    equipment: ['Box stable (40-60 cm)'],
    difficulty: 2,
    description:
      'Depuis le sol, fléchis rapidement et saute pour atterrir en squat amorti sur la box, debout dans la foulée. Redescends en marchant (pas en sautant).',
    cues: ['Élan des bras puissant', 'Atterrissage en douceur, pieds à plat', 'Termine debout, hanches en extension', 'Redescente en marchant pour épargner les tendons'],
    commonMistakes: ['Box trop haute : réception en squat très profond', 'Redescendre en sautant', 'Genoux qui rentrent à la réception'],
    trailBenefit:
      'Explosivité et confiance pour franchir rochers, marches et racines : utile sur les sentiers techniques et pour les relances après un ravito.',
    regression: 'Marche basse (20-30 cm).',
    progression: 'Box plus haute ou saut unipodal sur box basse.',
    // Apogée du vol juste au-dessus de l'arête de la box (pointes à y < −0,7) pour ne jamais la traverser.
    // Élan des bras → vol groupé → réception amortie sur la box → debout → redescente en marchant (pas en sautant).
    animation: {
      durationMs: 3600,
      timing: [0, 0.13, 0.25, 0.37, 0.48, 0.54, 0.6, 0.618, 0.635, 0.67, 0.76, 0.87],
      props: [{ kind: 'BOX', x: 1.0, width: 1.0, height: 0.7 }],
      keyframes: [
        anchored(-0.16, { torso: 45, nearThigh: 85, nearShin: -33, farThigh: 85, farShin: -33, nearUpperArm: -45, nearForearm: -20, farUpperArm: -45, farForearm: -20 }),
        anchored(-0.072, { torso: 15, nearThigh: 10, nearShin: 2, farThigh: 10, farShin: 2, nearFoot: 45, farFoot: 45, nearUpperArm: 160, nearForearm: 165, farUpperArm: 160, farForearm: 165 }),
        { ...pose({ torso: 25, nearThigh: 75, nearShin: -25, farThigh: 75, farShin: -25, nearFoot: 80, farFoot: 80, nearUpperArm: 110, nearForearm: 120, farUpperArm: 110, farForearm: 120 }), hipX: -0.33, air: 0.92 },
        { ...anchored(0.75, { torso: 40, nearThigh: 80, nearShin: -30, farThigh: 80, farShin: -30, nearUpperArm: 85, nearForearm: 90, farUpperArm: 85, farForearm: 90 }), groundOffset: 0.7 },
        { ...anchored(0.75, { nearUpperArm: 8, nearForearm: 15, farUpperArm: 8, farForearm: 15 }), groundOffset: 0.7 },
        // Pied proche levé et ramené au-dessus de la box avant de reculer (aucun frottement sur l'arête).
        { ...pose({ torso: 4, nearThigh: 20, nearShin: -50, nearUpperArm: 12, nearForearm: 20, farUpperArm: 12, farForearm: 20 }), hipX: 0.75, groundOffset: 0.7 },
        // Pied proche passé derrière la box, encore au-dessus de son niveau : le pied éloigné porte seul (y = −0,7).
        { ...pose({ torso: 6, farThigh: 10, farShin: -8, nearThigh: -10, nearShin: -45, nearUpperArm: 18, nearForearm: 28, farUpperArm: 18, farForearm: 28 }), hipX: 0.715, groundOffset: 0.7 },
        { ...pose({ torso: 8.25, farThigh: 19.5, farShin: -15, nearThigh: -12.5, nearShin: -37.5, nearFoot: 63, nearUpperArm: 21, nearForearm: 31, farUpperArm: 21, farForearm: 31 }), hipX: 0.685, groundOffset: 0.7 },
        // Intermédiaire calculé : la hauteur garde la cheville éloignée sur la box pendant que le pied proche descend.
        { ...pose({ torso: 10.5, farThigh: 29, farShin: -22, nearThigh: -15, nearShin: -30, nearFoot: 52, nearUpperArm: 24, nearForearm: 34, farUpperArm: 24, farForearm: 34 }), hipX: 0.655, groundOffset: 0.485 },
        // Pied proche posé au sol pointe en premier, pied éloigné encore sur la box (genou fléchi).
        { ...pose({ torso: 15, farThigh: 48, farShin: -36, nearThigh: -20, nearShin: -15, nearFoot: 30, nearUpperArm: 30, nearForearm: 40, farUpperArm: 30, farForearm: 40 }), hipX: 0.595 },
        { ...anchored(-0.16, { torso: 6, nearThigh: 5, farThigh: 70, farShin: -45, nearUpperArm: 15, nearForearm: 25, farUpperArm: 15, farForearm: 25 }) },
        anchored(-0.16, {}),
      ],
    },
  },
  {
    id: 'skipping',
    name: 'Skipping haut',
    category: 'PLYOMETRICS',
    muscles: ['Fléchisseurs de hanche', 'Mollets', 'Abdominaux'],
    equipment: ['Aucun'],
    difficulty: 1,
    description:
      'Sur place ou en avançant lentement, monte alternativement les genoux à hauteur de hanche avec des appuis rapides et dynamiques sur l’avant-pied.',
    cues: ['Genou à l’horizontale', 'Appuis brefs sur l’avant-pied', 'Buste grand, légèrement en avant', 'Bras coordonnés à 90°'],
    commonMistakes: ['Se pencher en arrière', 'Talons qui touchent le sol', 'Genoux qui ne montent pas en fin de série'],
    trailBenefit:
      'Améliore la fréquence de foulée et la levée de genou : on accroche moins les racines et cailloux, surtout quand la fatigue arrive en fin d’ultra.',
    regression: 'Montées de genou marchées.',
    progression: 'En côte, ou enchaîné avec 20 m d’accélération.',
    // Genou à l'horizontale, appuis brefs sur l'avant-pied, petite phase de vol, bras opposé fléchi à 90°.
    animation: {
      repsPerCycle: 2,
      durationMs: 760,
      timing: [0, 0.25, 0.5, 0.75],
      keyframes: [...SKIP, ...SKIP.map(swapSides)],
    },
  },
]
