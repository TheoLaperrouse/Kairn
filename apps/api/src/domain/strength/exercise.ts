/**
 * Exercices de renforcement spécifiques au trail.
 *
 * Chaque exercice embarque une animation « bonhomme » décrite par des poses-clés
 * (vue de profil, le personnage regarde vers la droite). Le front interpole les
 * poses pour produire une démonstration animée sans dépendre d'une vidéo externe.
 */

export type ExerciseCategory =
  | 'GAINAGE'
  | 'FORCE'
  | 'EXCENTRIQUE'
  | 'PLIOMETRIE'
  | 'PROPRIOCEPTION'
  | 'MOBILITE'

/**
 * Angles en degrés.
 * - Segments « pendants » (bras, avant-bras, cuisses, tibias) : 0 = vertical vers le bas,
 *   valeur positive = rotation vers l'avant (la droite), négative = vers l'arrière.
 * - Tronc : 0 = vertical vers le haut, positif = penché vers l'avant, 90 = horizontal tête devant.
 * - Tête : inclinaison relative au tronc (optionnelle).
 * Les jambes/bras « near » sont côté spectateur, « far » côté opposé (dessinés plus clair).
 */
export interface Pose {
  torso: number
  head?: number
  nearUpperArm: number
  nearForearm: number
  farUpperArm: number
  farForearm: number
  nearThigh: number
  nearShin: number
  farThigh: number
  farShin: number
  /** Décalage horizontal du bassin (unités de la scène, 1 = longueur de cuisse). */
  /**
   * Angle absolu du pied (même convention que les segments pendants : 90 = à plat vers l'avant,
   * < 90 = pointe vers le bas, ex. 60 en demi-pointes). Par défaut : à plat quand le tibia est
   * proche de la verticale, dans le prolongement naturel quand la jambe est en l'air ou à l'horizontale.
   */
  nearFoot?: number
  farFoot?: number
  hipX?: number
  /** Hauteur au-dessus du sol pour les phases aériennes (sauts). Par défaut le point le plus bas touche le sol. */
  air?: number
  /** Si renseigné, le point le plus bas est posé à cette hauteur (ex. pied sur une marche). */
  groundOffset?: number
}

export interface SceneProp {
  kind: 'BOX' | 'BENCH' | 'MAT' | 'BAND' | 'DUMBBELL' | 'CUSHION' | 'WALL'
  /** Position horizontale du centre, mêmes unités que hipX. */
  x: number
  width?: number
  height?: number
}

export interface ExerciseAnimation {
  durationMs: number
  keyframes: Pose[]
  /**
   * Instant (0 → 1) de chaque pose-clé dans le cycle, croissant, premier à 0. Permet un tempo réaliste
   * (descente lente, remontée rapide, maintien). Par défaut : poses-clés régulièrement espacées.
   * Deux instants voisins avec la même pose produisent un maintien.
   */
  timing?: number[]
  /** Répétitions contenues dans un cycle (2 quand le cycle montre les deux côtés). Défaut : 1. */
  repsPerCycle?: number
  props?: SceneProp[]
}

export interface Exercise {
  id: string
  name: string
  category: ExerciseCategory
  muscles: string[]
  equipment: string[]
  difficulty: 1 | 2 | 3
  description: string
  cues: string[]
  commonMistakes: string[]
  trailBenefit: string
  /** Variante plus facile / plus difficile, en texte. */
  regression?: string
  progression?: string
  animation: ExerciseAnimation
}
