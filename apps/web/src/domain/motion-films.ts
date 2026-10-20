import type { ExerciseCategory } from './models'

/**
 * Films de démonstration réalisés avec Claude Motion, un par catégorie d'exercices.
 *
 * Chaque exercice occupe un passage d'un nombre entier de cycles du mouvement, qui boucle sans à-coup
 * (pose de départ = pose de fin) : le lecteur de séance guidée rejoue ce passage pendant la série.
 *
 * Les MP4 s'exportent depuis la page de chaque film (bouton « Export ») et se déposent dans
 * `apps/web/public/motion/<fichier>`. Tant qu'un MP4 est absent, l'app retombe sur
 * l'animation anatomique calculée en direct à partir des mêmes poses-clés.
 */
interface MotionFilm {
  category: ExerciseCategory
  title: string
  url: string
  file: string
  /** [début, fin, nombre de cycles du mouvement dans le passage] en secondes. */
  segments: Record<string, [number, number, number]>
}

const MOTION_FILMS: MotionFilm[] = [
  {
    category: 'GAINAGE',
    title: 'Kairn — Gainage',
    url: 'https://claude.ai/artifact/5MMudwcT8cWzYXMAVgEem2',
    file: 'gainage.mp4',
    segments: {
      planche: [2.5, 9.5, 1],
      'planche-laterale': [9.5, 13.1, 1],
      'dead-bug': [13.1, 19.1, 1],
      'bird-dog': [19.1, 25.1, 1],
      'pont-fessier-unipodal': [25.1, 28.3, 1],
    },
  },
  {
    category: 'FORCE',
    title: 'Kairn — Force',
    url: 'https://claude.ai/artifact/Ax8D1boxSsPnqw75vCZE4T',
    file: 'force.mp4',
    segments: {
      squat: [2.5, 7.7, 2],
      'fente-avant': [7.7, 13.3, 1],
      'fente-bulgare': [13.3, 16.9, 1],
      'step-up': [16.9, 20.3, 1],
      'souleve-de-terre-unipodal': [20.3, 23.9, 1],
      'mollets-marche': [23.9, 27.7, 1],
      chaise: [27.7, 31.7, 1],
    },
  },
  {
    category: 'EXCENTRIQUE',
    title: 'Kairn — Excentrique',
    url: 'https://claude.ai/artifact/8wmqqRaWd2fs5RHAG4abh8',
    file: 'excentrique.mp4',
    segments: {
      'squat-excentrique': [2.5, 6.9, 1],
      'step-down-excentrique': [6.9, 11.1, 1],
      'nordic-hamstring': [11.1, 15.7, 1],
      'mollets-excentriques': [15.7, 20.7, 1],
    },
  },
  {
    category: 'PLIOMETRIE',
    title: 'Kairn — Pliométrie',
    url: 'https://claude.ai/artifact/THQFzFMdyjmCfgCEGFKBST',
    file: 'pliometrie.mp4',
    segments: {
      'squat-jump': [2.5, 6.5, 2],
      'fentes-sautees': [6.5, 10.9, 2],
      bondissements: [10.9, 13.9, 2],
      'sauts-sur-box': [13.9, 17.5, 1],
      skipping: [17.5, 20.54, 4],
    },
  },
  {
    category: 'PROPRIOCEPTION',
    title: 'Kairn — Proprioception',
    url: 'https://claude.ai/artifact/9YjLsLupjNF2dLqxG9Xs6w',
    file: 'proprioception.mp4',
    segments: {
      'equilibre-coussin': [2.5, 7.7, 1],
      avion: [7.7, 13.7, 1],
    },
  },
  {
    category: 'MOBILITE',
    title: 'Kairn — Mobilité',
    url: 'https://claude.ai/artifact/9r7kxSbcWWvG52sMiPfe6v',
    file: 'mobilite.mp4',
    segments: {
      'fente-psoas': [2.5, 7.5, 1],
      'mobilite-cheville-mur': [7.5, 10.5, 1],
    },
  },
]

export interface MotionClip {
  src: string
  start: number
  end: number
  /** Durée d'un cycle du mouvement dans le film, en secondes. */
  cycleSec: number
}

export function motionClipFor(exerciseId: string): MotionClip | undefined {
  for (const film of MOTION_FILMS) {
    const segment = film.segments[exerciseId]
    if (segment) {
      const [start, end, cycles] = segment
      return { src: `/motion/${film.file}`, start, end, cycleSec: (end - start) / cycles }
    }
  }
  return undefined
}
