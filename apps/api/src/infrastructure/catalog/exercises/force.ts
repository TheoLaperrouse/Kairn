import type { Exercise } from '../../../domain/strength/exercise'
import { SQUAT_BOTTOM, SQUAT_MID } from './poses'
import {
  BULGARIAN_BOTTOM,
  BULGARIAN_MID,
  BULGARIAN_TOP,
  CALF_BOTTOM,
  CALF_FLAT,
  CALF_TOP,
  LUNGE_BOTTOM,
  LUNGE_LANDING,
  LUNGE_STEP,
  SINGLE_LEG_HALF,
  SINGLE_LEG_HINGE,
  SINGLE_LEG_STAND,
  SQUAT_START,
  STEP_DRIVE,
  STEP_LIFT,
  STEP_START,
  STEP_TOP,
  WALL_SIT,
  WALL_SIT_BREATH,
  mirrorFull,
} from './poses-force'

export const FORCE: Exercise[] = [
  {
    id: 'squat',
    name: 'Squat',
    category: 'FORCE',
    muscles: ['Quadriceps', 'Grand fessier', 'Adducteurs'],
    equipment: ['Poids du corps', 'Haltères (option)'],
    difficulty: 1,
    description:
      'Pieds largeur de hanches, descends les fesses vers l’arrière et vers le bas comme pour t’asseoir, jusqu’à ce que les cuisses soient parallèles au sol, puis remonte en poussant dans tout le pied.',
    cues: [
      'Poids réparti sur tout le pied, talons au sol',
      'Genoux dans l’axe des orteils',
      'Dos neutre, poitrine ouverte',
      'Remonte en expirant',
    ],
    commonMistakes: ['Genoux qui rentrent vers l’intérieur', 'Talons qui décollent', 'Dos qui s’arrondit en bas'],
    trailBenefit:
      'La base de la force des cuisses : des quadriceps plus forts encaissent mieux les milliers de flexions d’une montée et retardent la fatigue musculaire.',
    regression: 'Squat sur une chaise (toucher puis se relever).',
    progression: 'Goblet squat avec haltère ou sac lesté, puis tempo lent.',
    animation: {
      // Descente 1 s (hanches d'abord), courte pause en bas, remontée 0,9 s.
      durationMs: 2600,
      keyframes: [SQUAT_START, SQUAT_MID, SQUAT_BOTTOM, SQUAT_BOTTOM, SQUAT_MID],
      timing: [0, 0.2, 0.4, 0.5, 0.72],
    },
  },
  {
    id: 'fente-avant',
    name: 'Fente avant',
    category: 'FORCE',
    muscles: ['Quadriceps', 'Grand fessier', 'Moyen fessier'],
    equipment: ['Poids du corps', 'Haltères (option)'],
    difficulty: 1,
    description:
      'Fais un grand pas en avant, descends jusqu’à ce que le genou arrière frôle le sol (deux angles à 90°), puis repousse sur la jambe avant pour revenir debout.',
    cues: [
      'Buste droit, gainé',
      'Genou avant au-dessus de la cheville',
      'Le genou arrière descend à la verticale',
      'Pousse dans le talon avant pour revenir',
    ],
    commonMistakes: ['Pas trop court : genou avant loin devant les orteils', 'Buste qui bascule en avant', 'Genou avant qui rentre'],
    trailBenefit:
      'Travail unilatéral proche du geste de montée en grandes marches : améliore la stabilité du genou et corrige les déséquilibres droite/gauche.',
    regression: 'Fente statique (sans revenir debout), main sur un appui.',
    progression: 'Fentes marchées avec haltères ou sac chargé.',
    animation: {
      repsPerCycle: 2,
      // Une fente de chaque côté : pas en avant, descente, pause, retour en poussant sur le talon avant.
      durationMs: 5600,
      keyframes: [
        SQUAT_START,
        LUNGE_STEP,
        LUNGE_LANDING,
        LUNGE_BOTTOM,
        LUNGE_BOTTOM,
        LUNGE_STEP,
        SQUAT_START,
        mirrorFull(LUNGE_STEP),
        mirrorFull(LUNGE_LANDING),
        mirrorFull(LUNGE_BOTTOM),
        mirrorFull(LUNGE_BOTTOM),
        mirrorFull(LUNGE_STEP),
      ],
      timing: [0, 0.08, 0.14, 0.2, 0.27, 0.37, 0.46, 0.54, 0.6, 0.66, 0.73, 0.83],
    },
  },
  {
    id: 'fente-bulgare',
    name: 'Fente bulgare',
    category: 'FORCE',
    muscles: ['Quadriceps', 'Grand fessier', 'Fléchisseurs de hanche (étirement)'],
    equipment: ['Banc ou chaise'],
    difficulty: 2,
    description:
      'Pied arrière posé sur un banc, pied avant à une grande enjambée. Descends verticalement jusqu’à ce que la cuisse avant soit parallèle au sol, puis remonte en poussant sur la jambe avant.',
    cues: [
      'Le poids est sur la jambe avant (80 %)',
      'Buste légèrement penché vers l’avant',
      'Descente contrôlée en 2-3 secondes',
      'Genou avant aligné avec le 2e orteil',
    ],
    commonMistakes: ['Pied avant trop près du banc', 'Pousser avec la jambe arrière', 'Perdre l’équilibre latéralement (pieds sur une même ligne)'],
    trailBenefit:
      "L'exercice roi du traileur : force unilatérale maximale du quadriceps et du fessier, exactement ce qui est sollicité dans les montées raides et les relances.",
    regression: 'Fente avant statique, pied arrière au sol.',
    progression: 'Haltères en mains, ou tempo excentrique 4 secondes.',
    animation: {
      // Descente contrôlée en ~2 s, pause, remontée en 1,2 s.
      durationMs: 3600,
      props: [{ kind: 'BENCH', x: -1.58, width: 0.8, height: 0.4 }],
      keyframes: [BULGARIAN_TOP, BULGARIAN_MID, BULGARIAN_BOTTOM, BULGARIAN_BOTTOM, BULGARIAN_MID],
      timing: [0, 0.28, 0.55, 0.64, 0.82],
    },
  },
  {
    id: 'step-up',
    name: 'Montée sur box (step-up)',
    category: 'FORCE',
    muscles: ['Quadriceps', 'Grand fessier', 'Mollets'],
    equipment: ['Box, marche ou banc stable'],
    difficulty: 1,
    description:
      'Pose un pied entier sur la box, pousse dessus pour te hisser jusqu’à l’extension complète en montant le genou opposé, puis redescends en contrôlant.',
    cues: [
      'Tout le pied sur la box, pas seulement la pointe',
      'Pousse avec la jambe du haut, pas d’élan avec celle du bas',
      'Monte le genou libre en fin de mouvement',
      'Redescente lente',
    ],
    commonMistakes: ['Prendre de l’élan avec la jambe au sol', 'Genou qui rentre', 'Box trop haute au début'],
    trailBenefit:
      'Reproduit la marche active en montée raide (pente > 25 %) : force spécifique pour les ascensions de 1 000 m D+ et au-delà.',
    regression: 'Marche basse (20 cm).',
    progression: 'Box plus haute, haltères ou sac d’ultra lesté (5-8 kg).',
    animation: {
      // Poussée sur la jambe du haut, genou libre monté, redescente lente pointe d'abord.
      durationMs: 3400,
      props: [{ kind: 'BOX', x: 0.72, width: 0.8, height: 0.5 }],
      keyframes: [STEP_START, STEP_DRIVE, STEP_LIFT, STEP_TOP, STEP_TOP, STEP_LIFT, STEP_DRIVE, STEP_START],
      timing: [0, 0.12, 0.22, 0.34, 0.46, 0.6, 0.76, 0.88],
    },
  },
  {
    id: 'souleve-de-terre-unipodal',
    name: 'Soulevé de terre jambe tendue unipodal',
    category: 'FORCE',
    muscles: ['Ischio-jambiers', 'Grand fessier', 'Stabilisateurs de cheville'],
    equipment: ['Haltère ou kettlebell (option)'],
    difficulty: 2,
    description:
      'Sur une jambe, genou légèrement fléchi, bascule le buste vers l’avant en envoyant la jambe libre vers l’arrière, jusqu’à ce que buste et jambe soient presque horizontaux. Remonte en serrant le fessier.',
    cues: [
      'Le mouvement vient de la hanche, dos plat',
      'Bassin horizontal : la hanche de la jambe libre ne s’ouvre pas',
      'Jambe libre et buste forment une ligne',
      'Genou d’appui souple, pas verrouillé',
    ],
    commonMistakes: ['Arrondir le dos', 'Ouvrir la hanche vers le ciel', 'Plier fortement la jambe d’appui (squat)'],
    trailBenefit:
      'Renforce les ischios et la proprioception de cheville en même temps : protège des entorses sur sentier technique et des déchirures en descente rapide.',
    regression: 'Pointe du pied arrière posée au sol pour l’équilibre.',
    progression: 'Charge dans la main opposée à la jambe d’appui.',
    animation: {
      // Bascule en 1,4 s, tenue, remontée en serrant le fessier.
      durationMs: 3600,
      keyframes: [SINGLE_LEG_STAND, SINGLE_LEG_HALF, SINGLE_LEG_HINGE, SINGLE_LEG_HINGE, SINGLE_LEG_HALF],
      timing: [0, 0.2, 0.4, 0.52, 0.72],
    },
  },
  {
    id: 'mollets-marche',
    name: 'Élévations des mollets sur marche',
    category: 'FORCE',
    muscles: ['Gastrocnémiens', 'Soléaire', 'Tendon d’Achille'],
    equipment: ['Marche ou step'],
    difficulty: 1,
    description:
      'Avant-pied sur le bord d’une marche, talons dans le vide. Monte le plus haut possible sur la pointe, puis redescends sous le niveau de la marche.',
    cues: [
      'Amplitude complète : talon sous la marche puis pointe maximale',
      'Montée en 1 seconde, descente en 2-3 secondes',
      'Genoux tendus (gastrocnémiens) puis fléchis (soléaire)',
      'Une main sur un mur pour l’équilibre',
    ],
    commonMistakes: ['Amplitude partielle', 'Rebondir en bas', 'Pied qui roule vers l’extérieur'],
    trailBenefit:
      'Les mollets propulsent chaque pas en montée et absorbent les appuis en descente. Des mollets endurants évitent crampes et tendinites d’Achille sur ultra.',
    regression: 'Sur sol plat, deux pieds.',
    progression: 'Sur une jambe, avec sac lesté.',
    animation: {
      // Montée en 1 s jusqu'à la pointe, pause, descente lente talon sous la marche.
      durationMs: 3800,
      props: [{ kind: 'BOX', x: 0.57, width: 0.8, height: 0.25 }, { kind: 'WALL', x: 1.3 }],
      keyframes: [CALF_BOTTOM, CALF_FLAT, CALF_TOP, CALF_TOP, CALF_FLAT, CALF_BOTTOM],
      timing: [0, 0.13, 0.27, 0.36, 0.62, 0.88],
    },
  },
  {
    id: 'chaise',
    name: 'Chaise contre le mur',
    category: 'FORCE',
    muscles: ['Quadriceps', 'Fessiers'],
    equipment: ['Mur'],
    difficulty: 1,
    description:
      'Dos plaqué contre un mur, descends jusqu’à avoir les cuisses parallèles au sol et les genoux à 90°. Tiens la position en respirant.',
    cues: ['Dos entièrement collé au mur', 'Genoux au-dessus des chevilles', 'Poids dans les talons', 'Respiration régulière'],
    commonMistakes: ['Mains appuyées sur les cuisses', 'Genoux qui dépassent les orteils', 'Fesses trop hautes'],
    trailBenefit:
      'Endurance isométrique des quadriceps : prépare à la position basse tenue en descente technique et aux longues sections de « cuisses qui brûlent ».',
    regression: 'Angle plus ouvert (cuisses à 45°).',
    progression: 'Sur une jambe, ou avec un poids sur les cuisses.',
    animation: {
      // Isométrie : position tenue, respiration ample et régulière.
      durationMs: 4000,
      props: [{ kind: 'WALL', x: -0.25 }],
      keyframes: [WALL_SIT, WALL_SIT_BREATH, WALL_SIT_BREATH, WALL_SIT],
      timing: [0, 0.35, 0.5, 0.85],
    },
  },
]
