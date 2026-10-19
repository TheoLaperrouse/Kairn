import type { Exercise } from '../../../domain/strength/exercise'
import {
  AIRPLANE_CLOSED,
  AIRPLANE_NEUTRAL,
  AIRPLANE_OPEN,
  BALANCE_BACK,
  BALANCE_FRONT,
  BALANCE_KNEE,
  BALANCE_WOBBLE,
} from './poses-force'

export const PROPRIOCEPTION: Exercise[] = [
  {
    id: 'equilibre-coussin',
    name: 'Équilibre unipodal sur coussin',
    category: 'PROPRIOCEPTION',
    muscles: ['Stabilisateurs de cheville', 'Péroniers', 'Moyen fessier'],
    equipment: ['Coussin d’équilibre ou coussin plié'],
    difficulty: 1,
    description:
      'Debout sur une jambe sur une surface instable, genou légèrement fléchi. Tiens l’équilibre en bougeant la jambe libre dans différentes directions.',
    cues: ['Genou d’appui souple', 'Regard fixe devant toi', 'Bassin horizontal', 'Pour corser : ferme les yeux'],
    commonMistakes: ['Jambe d’appui verrouillée', 'Bloquer la respiration', 'Se rattraper avec la jambe libre trop vite'],
    trailBenefit:
      "Le meilleur antidote aux entorses de cheville sur sentier : entraîne les réflexes qui rattrapent un appui fuyant sur une pierre ou une racine, même de nuit.",
    regression: 'Sur sol dur.',
    progression: 'Yeux fermés, ou en lançant/rattrapant une balle.',
    animation: {
      // Genou levé, petites corrections, puis la jambe libre explore devant et derrière.
      durationMs: 5200,
      props: [{ kind: 'CUSHION', x: 0.12, width: 0.7, height: 0.12 }],
      keyframes: [BALANCE_KNEE, BALANCE_WOBBLE, BALANCE_KNEE, BALANCE_FRONT, BALANCE_KNEE, BALANCE_BACK],
      timing: [0, 0.12, 0.24, 0.42, 0.6, 0.78],
    },
  },
  {
    id: 'avion',
    name: 'Avion (airplane)',
    category: 'PROPRIOCEPTION',
    muscles: ['Moyen fessier', 'Rotateurs de hanche', 'Ischio-jambiers', 'Stabilisateurs de cheville'],
    equipment: ['Aucun'],
    difficulty: 3,
    description:
      'En équilibre sur une jambe, buste et jambe libre à l’horizontale comme pour un soulevé de terre unipodal, bras en croix. Fais pivoter le bassin pour ouvrir puis fermer la hanche, sans perdre l’équilibre.',
    cues: ['Rotation qui vient de la hanche d’appui', 'Buste et jambe libre restent alignés', 'Genou d’appui souple', 'Mouvement lent, 2 secondes par sens'],
    commonMistakes: ['Tourner seulement les épaules', 'Perdre l’alignement buste/jambe', 'Aller trop vite'],
    trailBenefit:
      'Stabilité de hanche en rotation : la hanche contrôle mieux le genou sur les appuis désaxés des sentiers techniques et des descentes en lacets.',
    regression: 'Mains sur un mur, amplitude réduite.',
    progression: 'Yeux fermés ou haltère léger.',
    animation: {
      // En charnière tenue : ouverture (bras proche vers le ciel), retour, fermeture, 2 s par sens.
      durationMs: 6000,
      keyframes: [AIRPLANE_NEUTRAL, AIRPLANE_OPEN, AIRPLANE_OPEN, AIRPLANE_NEUTRAL, AIRPLANE_CLOSED, AIRPLANE_CLOSED],
      timing: [0, 0.18, 0.3, 0.5, 0.68, 0.8],
    },
  },
]
