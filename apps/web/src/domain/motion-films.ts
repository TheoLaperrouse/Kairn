import type { ExerciseCategory } from './models'

/**
 * Demo films made with Claude Motion, one per exercise category.
 *
 * Each exercise spans a whole number of movement cycles, which loops seamlessly
 * (start pose = end pose): the guided-session player replays that span during the set.
 *
 * The MP4s are exported from each film's page ("Export" button) and dropped into
 * `apps/web/public/motion/<file>`. While an MP4 is missing, the app falls back to
 * the anatomical animation computed live from the same keyframes.
 */
interface MotionFilm {
  category: ExerciseCategory
  title: string
  url: string
  file: string
  /** [start, end, number of movement cycles in the span] in seconds. */
  segments: Record<string, [number, number, number]>
}

const MOTION_FILMS: MotionFilm[] = [
  {
    category: 'CORE',
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
    category: 'STRENGTH',
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
    category: 'ECCENTRIC',
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
    category: 'PLYOMETRICS',
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
    category: 'MOBILITY',
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
  /** Duration of one movement cycle in the film, in seconds. */
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
