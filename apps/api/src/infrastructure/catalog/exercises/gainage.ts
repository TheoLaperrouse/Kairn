import type { Exercise } from '../../../domain/strength/exercise'
import {
  BIRD_DOG_ANIMATION,
  DEAD_BUG_ANIMATION,
  PLANCHE_ANIMATION,
  PLANCHE_LATERALE_ANIMATION,
  PONT_FESSIER_ANIMATION,
} from './animations-gainage-mobilite'

export const GAINAGE: Exercise[] = [
  {
    id: 'planche',
    name: 'Planche sur avant-bras',
    category: 'GAINAGE',
    muscles: ['Transverse', 'Grand droit', 'Fessiers', 'Épaules'],
    equipment: ['Tapis'],
    difficulty: 1,
    description:
      "En appui sur les avant-bras et la pointe des pieds, le corps forme une ligne droite des talons à la tête. Variante dynamique : lever une jambe tendue en alternance sans bouger le bassin.",
    cues: [
      'Coudes sous les épaules, avant-bras parallèles',
      'Rentre le nombril et serre les fessiers',
      'Regard vers le sol, nuque dans le prolongement',
      'Respire calmement, ne bloque pas la respiration',
    ],
    commonMistakes: ['Bassin qui s’affaisse (cambrure lombaire)', 'Fesses trop hautes en « tente »', 'Épaules qui s’enfoncent entre les omoplates'],
    trailBenefit:
      "Un tronc solide stabilise le bassin à chaque foulée : moins de déperdition d'énergie en côte et une posture qui tient encore après 10 heures d'effort quand le sac pèse.",
    regression: 'Genoux au sol, même alignement épaules-hanches-genoux.',
    progression: 'Lever une jambe ou un bras en alternance, ou porter le sac d’ultra chargé.',
    animation: PLANCHE_ANIMATION,
  },
  {
    id: 'planche-laterale',
    name: 'Planche latérale avec relevé de bassin',
    category: 'GAINAGE',
    muscles: ['Obliques', 'Moyen fessier', 'Carré des lombes'],
    equipment: ['Tapis'],
    difficulty: 2,
    description:
      "En appui sur un avant-bras et le bord externe du pied, corps aligné. Descends légèrement le bassin puis remonte-le au-dessus de l'alignement en contrôlant.",
    cues: [
      'Coude exactement sous l’épaule',
      'Pieds empilés, jambes tendues',
      'Pousse le bassin vers le plafond, sans rotation',
      'Bras libre tendu vers le ciel',
    ],
    commonMistakes: ['Bassin qui part vers l’arrière', 'Épaule d’appui qui s’affaisse', 'Mouvement trop rapide et balancé'],
    trailBenefit:
      "Le moyen fessier et les obliques contrôlent la bascule du bassin en appui unipodal : indispensable sur les dévers, les pierriers et pour protéger les genoux (syndrome de l'essuie-glace).",
    regression: 'Genoux fléchis au sol, maintien statique.',
    progression: 'Lever la jambe du dessus en maintenant le bassin haut.',
    animation: PLANCHE_LATERALE_ANIMATION,
  },
  {
    id: 'dead-bug',
    name: 'Dead bug',
    category: 'GAINAGE',
    muscles: ['Transverse', 'Grand droit', 'Fléchisseurs de hanche'],
    equipment: ['Tapis'],
    difficulty: 1,
    description:
      'Allongé sur le dos, bras tendus vers le plafond, hanches et genoux à 90°. Allonge simultanément un bras derrière la tête et la jambe opposée, sans décoller le bas du dos.',
    cues: [
      'Bas du dos plaqué au sol en permanence',
      'Expire longuement en allongeant bras et jambe',
      'Mouvement lent et contrôlé, 3 secondes aller',
      'Bras et jambe opposés',
    ],
    commonMistakes: ['Cambrure qui se creuse quand la jambe s’allonge', 'Mouvement trop rapide', 'Bloquer sa respiration'],
    trailBenefit:
      'Apprend à dissocier les membres d’un tronc stable, comme en course : la jambe avance pendant que le bassin reste gainé, ce qui économise le dos dans les longues descentes.',
    regression: 'Ne bouger que les jambes, en touchant le sol avec le talon.',
    progression: 'Tenir un élastique tendu entre les mains ou un poids léger.',
    animation: DEAD_BUG_ANIMATION,
  },
  {
    id: 'bird-dog',
    name: 'Bird dog',
    category: 'GAINAGE',
    muscles: ['Érecteurs du rachis', 'Fessiers', 'Deltoïdes', 'Transverse'],
    equipment: ['Tapis'],
    difficulty: 1,
    description:
      'À quatre pattes, mains sous les épaules et genoux sous les hanches. Tends un bras devant et la jambe opposée derrière jusqu’à l’horizontale, tiens 2 secondes, reviens.',
    cues: [
      'Dos plat comme une table',
      'Pousse le talon loin derrière, pas vers le haut',
      'Bassin parallèle au sol, sans rotation',
      'Regard vers le sol',
    ],
    commonMistakes: ['Lever la jambe trop haut et cambrer', 'Bassin qui pivote', 'Aller trop vite'],
    trailBenefit:
      'Renforce la chaîne postérieure en coordination croisée bras/jambe opposés — le schéma exact de la course et de la marche active avec bâtons.',
    regression: 'Lever seulement la jambe, puis seulement le bras.',
    progression: 'Ramener coude et genou sous le ventre entre chaque extension.',
    animation: BIRD_DOG_ANIMATION,
  },
  {
    id: 'pont-fessier-unipodal',
    name: 'Pont fessier unipodal',
    category: 'GAINAGE',
    muscles: ['Grand fessier', 'Ischio-jambiers', 'Lombaires'],
    equipment: ['Tapis'],
    difficulty: 2,
    description:
      'Allongé sur le dos, un pied au sol près des fesses, l’autre jambe tendue. Pousse dans le talon pour monter le bassin jusqu’à l’alignement épaules-hanche-genou, puis redescends sans poser.',
    cues: [
      'Pousse dans le talon, orteils légèrement relevés',
      'Serre le fessier en haut, 1 seconde de pause',
      'Bassin bien horizontal, sans bascule latérale',
      'Jambe libre dans le prolongement de la cuisse',
    ],
    commonMistakes: ['Monter en cambrant au lieu de serrer les fessiers', 'Bassin qui penche du côté de la jambe libre', 'Pied trop loin (crampes ischios)'],
    trailBenefit:
      'Le grand fessier est le moteur des montées raides. Le réveiller limite la surcharge des quadriceps et des lombaires sur les longues ascensions.',
    regression: 'Pont fessier sur deux pieds.',
    progression: 'Pied d’appui surélevé sur un banc, ou charge sur le bassin.',
    animation: PONT_FESSIER_ANIMATION,
  },
]
