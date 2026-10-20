import type { ExerciseAnimation, Pose } from '../../../domain/strength/exercise'
import { pose } from './poses'

/**
 * Animations de gainage et de mobilité, calibrées géométriquement :
 * appuis réellement au sol (épaisseur des membres comprise via `groundOffset`),
 * corps rectiligne en gainage, tempo réaliste (`timing`) et micro-mouvements de respiration
 * pendant les maintiens.
 */

/**
 * Cinématique inverse du bras (coude vers le bas) : angles absolus du bras et de l'avant-bras
 * pour que la main atteigne une cible donnée par rapport au cou (x vers l'avant, y vers le HAUT).
 */
function reach(dx: number, dyUp: number): { upper: number; fore: number } {
  const L1 = 0.65
  const L2 = 0.6
  const vx = dx
  const vy = -dyUp // repère du squelette : y vers le bas
  const dist = Math.min(Math.hypot(vx, vy), L1 + L2 - 0.005)
  const base = Math.atan2(vx, vy)
  const offset = Math.acos((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))
  const a1 = base - offset
  const ex = L1 * Math.sin(a1)
  const ey = L1 * Math.cos(a1)
  const a2 = Math.atan2(vx - ex, vy - ey)
  const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 10) / 10
  return { upper: deg(a1), fore: deg(a2) }
}

/** Position du cou par rapport à la hanche (y vers le haut) pour une inclinaison de tronc donnée. */
function neckFromHip(torso: number): { x: number; y: number } {
  const t = (torso * Math.PI) / 180
  return { x: 1.3 * Math.sin(t), y: 1.3 * Math.cos(t) }
}

const ARMS_ON_FOREARMS = { nearUpperArm: 0, nearForearm: 90, farUpperArm: 0, farForearm: 90 }
/** Épaisseur de l'avant-bras / du genou : les articulations sont légèrement au-dessus du sol. */
const FOREARM_CONTACT = 0.045
const KNEE_CONTACT = 0.09

// Planche : ligne droite chevilles (orteils repliés) → épaules à 0,65 au-dessus des coudes.
const PLANK: Pose = pose({
  torso: 83,
  head: 6,
  ...ARMS_ON_FOREARMS,
  nearThigh: -83,
  nearShin: -83,
  farThigh: -83,
  farShin: -83,
  nearFoot: 32,
  farFoot: 32,
  groundOffset: FOREARM_CONTACT,
})
const PLANK_EXHALE: Pose = { ...PLANK, torso: 82.3, nearThigh: -83.6, nearShin: -83.6, farThigh: -83.6, farShin: -83.6 }
const PLANK_NEAR_UP: Pose = { ...PLANK, nearThigh: -94, nearShin: -94, nearFoot: 8 }
const PLANK_NEAR_UP_HOLD: Pose = { ...PLANK_NEAR_UP, nearThigh: -95, nearShin: -95, torso: 82.6 }
const PLANK_FAR_UP: Pose = { ...PLANK, farThigh: -94, farShin: -94, farFoot: 8 }
const PLANK_FAR_UP_HOLD: Pose = { ...PLANK_FAR_UP, farThigh: -95, farShin: -95, torso: 82.6 }

export const PLANK_ANIMATION: ExerciseAnimation = {
  durationMs: 7000,
  props: [{ kind: 'MAT', x: -0.2, width: 4.2 }],
  keyframes: [PLANK, PLANK_EXHALE, PLANK_NEAR_UP, PLANK_NEAR_UP_HOLD, PLANK, PLANK_EXHALE, PLANK_FAR_UP, PLANK_FAR_UP_HOLD],
  timing: [0, 0.12, 0.24, 0.36, 0.5, 0.62, 0.74, 0.86],
}

// Planche latérale, vue de face : avant-bras d'appui sous l'épaule, pieds empilés sur la tranche.
const side = (torso: number, legs: number): Pose =>
  pose({
    torso,
    head: 0,
    nearUpperArm: 0,
    nearForearm: 90,
    farUpperArm: 180,
    farForearm: 180,
    nearThigh: legs,
    nearShin: legs,
    farThigh: legs,
    farShin: legs,
    nearFoot: -60,
    farFoot: -60,
    groundOffset: FOREARM_CONTACT,
  })
/** Corps aligné, bassin légèrement affaissé, bassin au-dessus de l'alignement. */
const SIDE_LINE = side(81, -81)
const SIDE_DIP = side(72, -87)
const SIDE_TOP = side(88, -77)
const SIDE_TOP_HOLD: Pose = { ...SIDE_TOP, farUpperArm: 183, farForearm: 183 }

export const SIDE_PLANK_ANIMATION: ExerciseAnimation = {
  durationMs: 3600,
  props: [{ kind: 'MAT', x: -0.2, width: 4.2 }],
  keyframes: [SIDE_LINE, SIDE_DIP, SIDE_TOP, SIDE_TOP_HOLD],
  timing: [0, 0.25, 0.6, 0.78],
}

// Dead bug : dos à plat (tête à gauche), hanches et genoux à 90°, bras vers le plafond.
const TABLETOP: Pose = pose({
  torso: -90,
  head: 0,
  nearUpperArm: 180,
  nearForearm: 180,
  farUpperArm: 180,
  farForearm: 180,
  nearThigh: 180,
  nearShin: 90,
  farThigh: 180,
  farShin: 90,
  nearFoot: 170,
  farFoot: 170,
})
/** Bras proche derrière la tête (au-dessus du sol), jambe opposée allongée juste au-dessus du sol. */
const DEADBUG_A: Pose = { ...TABLETOP, nearUpperArm: 262, nearForearm: 262, farThigh: 93.5, farShin: 93.5, farFoot: 160 }
const DEADBUG_A_HOLD: Pose = { ...DEADBUG_A, nearUpperArm: 264, nearForearm: 264, farThigh: 92.5, farShin: 92.5 }
const DEADBUG_B: Pose = { ...TABLETOP, farUpperArm: 262, farForearm: 262, nearThigh: 93.5, nearShin: 93.5, nearFoot: 160 }
const DEADBUG_B_HOLD: Pose = { ...DEADBUG_B, farUpperArm: 264, farForearm: 264, nearThigh: 92.5, nearShin: 92.5 }

export const DEAD_BUG_ANIMATION: ExerciseAnimation = {
  durationMs: 6000,
  props: [{ kind: 'MAT', x: 0, width: 4.4 }],
  keyframes: [TABLETOP, DEADBUG_A, DEADBUG_A_HOLD, TABLETOP, DEADBUG_B, DEADBUG_B_HOLD],
  timing: [0, 0.3, 0.4, 0.5, 0.8, 0.9],
}

// Bird dog : mains sous les épaules, genoux sous les hanches, dos plat, regard au sol.
const QUADRUPED: Pose = pose({
  torso: 78,
  head: 12,
  nearUpperArm: 0,
  nearForearm: 0,
  farUpperArm: 0,
  farForearm: 0,
  nearThigh: 0,
  nearShin: -90,
  farThigh: 0,
  farShin: -90,
  nearFoot: -95,
  farFoot: -95,
  groundOffset: 0.1,
})
/** Bras proche devant + jambe éloignée derrière, à l'horizontale. */
const BIRD_A: Pose = { ...QUADRUPED, torso: 80, nearUpperArm: 96, nearForearm: 96, farThigh: -90, farShin: -90, farFoot: -5 }
const BIRD_A_HOLD: Pose = { ...BIRD_A, nearUpperArm: 98, nearForearm: 98, farThigh: -92, farShin: -92 }
const BIRD_B: Pose = { ...QUADRUPED, torso: 80, farUpperArm: 96, farForearm: 96, nearThigh: -90, nearShin: -90, nearFoot: -5 }
const BIRD_B_HOLD: Pose = { ...BIRD_B, farUpperArm: 98, farForearm: 98, nearThigh: -92, nearShin: -92 }

export const BIRD_DOG_ANIMATION: ExerciseAnimation = {
  durationMs: 6000,
  props: [{ kind: 'MAT', x: 0.2, width: 4 }],
  keyframes: [QUADRUPED, BIRD_A, BIRD_A_HOLD, QUADRUPED, BIRD_B, BIRD_B_HOLD],
  timing: [0, 0.25, 0.4, 0.5, 0.75, 0.9],
}

// Pont fessier unipodal. Épaules et pied d'appui fixes au sol ; en haut, épaules-hanche-genou alignés.
// Angles obtenus par intersection de cercles (épaule → genou = 2,3 ; genou → cheville = 1).
const BRIDGE_DOWN: Pose = pose({
  torso: -90,
  head: 0,
  nearUpperArm: 83,
  nearForearm: 83,
  farUpperArm: 83,
  farForearm: 83,
  nearThigh: 135,
  nearShin: -35,
  nearFoot: 98,
  farThigh: 135,
  farShin: 135,
  farFoot: 150,
})
const BRIDGE_UP: Pose = {
  ...BRIDGE_DOWN,
  torso: -100.5,
  head: 10.5,
  nearThigh: 100.5,
  nearShin: -57.3,
  farThigh: 100.5,
  farShin: 100.5,
  farFoot: 160,
}
const BRIDGE_UP_HOLD: Pose = { ...BRIDGE_UP, torso: -101.2, nearThigh: 101.2, farThigh: 102, farShin: 102 }

export const GLUTE_BRIDGE_ANIMATION: ExerciseAnimation = {
  durationMs: 3200,
  props: [{ kind: 'MAT', x: -0.3, width: 4 }],
  keyframes: [BRIDGE_DOWN, BRIDGE_UP, BRIDGE_UP_HOLD],
  timing: [0, 0.4, 0.62],
}

// Fente basse psoas. Jambe proche = jambe arrière (genou au sol, cou-de-pied à plat) : c'est elle
// qu'on étire, donc ses fléchisseurs de hanche s'allument. Pied avant fixe, bassin qui avance.
const halfKneel = (backThigh: number, frontShin: number, hipX: number, torso: number, arm: number): Pose => {
  // Main libre posée sur la cuisse avant (horizontale, dessus à ~0,19 au-dessus de la hanche).
  const neck = neckFromHip(torso)
  const hand = reach(0.62 - neck.x, 0.24 - neck.y)
  return pose({
    torso,
    head: -torso * 0.5,
    nearThigh: backThigh,
    nearShin: -90,
    nearFoot: -92,
    farThigh: 90,
    farShin: frontShin,
    farFoot: 90,
    nearUpperArm: arm,
    nearForearm: arm,
    farUpperArm: hand.upper,
    farForearm: hand.fore,
    hipX,
    groundOffset: KNEE_CONTACT,
  })
}
const PSOAS_START = halfKneel(0, 0, 0, 0, 176)
const PSOAS_STRETCH = halfKneel(-20, -20, 0.34, -5, 184)
const PSOAS_EXHALE = halfKneel(-22, -22, 0.37, -7, 188)

export const HIP_FLEXOR_LUNGE_ANIMATION: ExerciseAnimation = {
  durationMs: 5000,
  props: [{ kind: 'MAT', x: 0.4, width: 3.2 }],
  keyframes: [PSOAS_START, PSOAS_STRETCH, PSOAS_EXHALE, PSOAS_STRETCH],
  timing: [0, 0.3, 0.55, 0.78],
}

// Mobilité de cheville genou au mur. Jambe proche = jambe avant (talon collé au sol).
// Genou arrière fixe ; à l'avancée, cuisse avant horizontale, tibias avant et cuisse arrière à −35°.
/** Mains à plat sur le mur (x = 1,72, hauteur 1,95) : les coudes se plient quand le corps avance. */
const WALL_X = 1.78
const HAND_ON_WALL = { x: WALL_X - 0.08, y: 1.95 }
const ankle = (angle: number, hipX: number, hipHeight: number, torso: number): Pose => {
  const neck = neckFromHip(torso)
  const near = reach(HAND_ON_WALL.x - hipX - neck.x, HAND_ON_WALL.y - hipHeight - neck.y)
  const far = reach(HAND_ON_WALL.x - 0.02 - hipX - neck.x, HAND_ON_WALL.y - 0.08 - hipHeight - neck.y)
  return pose({
    torso,
    head: -torso * 0.6,
    nearThigh: 90,
    nearShin: -angle,
    nearFoot: 90,
    farThigh: -angle,
    farShin: -90,
    farFoot: -92,
    nearUpperArm: near.upper,
    nearForearm: near.fore,
    farUpperArm: far.upper,
    farForearm: far.fore,
    hipX,
    groundOffset: KNEE_CONTACT,
  })
}
// Hauteur de hanche : 1 + contact genou (0,09) au départ ; cos(35°) + 0,09 à l'avancée.
const ANKLE_BACK = ankle(0, 0, 1.09, 26)
const ANKLE_FORWARD = ankle(35, 0.574, 0.909, 16)
const ANKLE_FORWARD_HOLD = ankle(36, 0.588, 0.899, 15)

export const ANKLE_MOBILITY_ANIMATION: ExerciseAnimation = {
  durationMs: 3000,
  props: [{ kind: 'WALL', x: WALL_X }, { kind: 'MAT', x: 0.4, width: 3 }],
  keyframes: [ANKLE_BACK, ANKLE_FORWARD, ANKLE_FORWARD_HOLD],
  timing: [0, 0.45, 0.62],
}
