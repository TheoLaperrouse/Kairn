/**
 * Trail-specific strength exercises.
 *
 * Each exercise embeds a "stick figure" animation described by keyframe poses
 * (side view, the figure faces right). The front end interpolates the
 * poses to produce an animated demo without relying on an external video.
 */

export type ExerciseCategory =
  | 'CORE'
  | 'STRENGTH'
  | 'ECCENTRIC'
  | 'PLYOMETRICS'
  | 'PROPRIOCEPTION'
  | 'MOBILITY'

/**
 * Angles in degrees.
 * - "Hanging" segments (upper arms, forearms, thighs, shins): 0 = vertical pointing down,
 *   positive value = rotation forwards (to the right), negative = backwards.
 * - Torso: 0 = vertical pointing up, positive = leaning forwards, 90 = horizontal, head in front.
 * - Head: tilt relative to the torso (optional).
 * "Near" legs/arms are on the viewer's side, "far" on the opposite side (drawn lighter).
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
  /** Horizontal pelvis offset (scene units, 1 = thigh length). */
  /**
   * Absolute foot angle (same convention as hanging segments: 90 = flat pointing forwards,
   * < 90 = toes pointing down, e.g. 60 on tiptoe). Default: flat when the shin is
   * near vertical, in natural extension when the leg is in the air or horizontal.
   */
  nearFoot?: number
  farFoot?: number
  hipX?: number
  /** Height above the ground for airborne phases (jumps). By default the lowest point touches the ground. */
  air?: number
  /** If set, the lowest point rests at this height (e.g. foot on a step). */
  groundOffset?: number
}

export interface SceneProp {
  kind: 'BOX' | 'BENCH' | 'MAT' | 'BAND' | 'DUMBBELL' | 'CUSHION' | 'WALL'
  /** Horizontal position of the center, same units as hipX. */
  x: number
  width?: number
  height?: number
}

export interface ExerciseAnimation {
  durationMs: number
  keyframes: Pose[]
  /**
   * Time (0 → 1) of each keyframe in the cycle, increasing, first at 0. Allows a realistic tempo
   * (slow lowering, fast rise, hold). Default: evenly spaced keyframes.
   * Two adjacent times with the same pose produce a hold.
   */
  timing?: number[]
  /** Reps contained in one cycle (2 when the cycle shows both sides). Default: 1. */
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
  /** Easier / harder variant, as text. */
  regression?: string
  progression?: string
  animation: ExerciseAnimation
}
