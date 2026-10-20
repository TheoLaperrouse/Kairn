import type { Pose } from '../../../domain/strength/exercise'
import { pose } from './poses'

/**
 * Poses for the strength and proprioception exercises, computed with inverse kinematics so that
 * contact points stay fixed (supporting foot, foot on the box or bench) throughout the movement.
 */

/** Swaps near and far sides, feet included (alternating left / right). */
export const mirrorFull = (p: Pose): Pose => ({
  ...p,
  nearThigh: p.farThigh,
  nearShin: p.farShin,
  farThigh: p.nearThigh,
  farShin: p.nearShin,
  nearFoot: p.farFoot,
  farFoot: p.nearFoot,
  nearUpperArm: p.farUpperArm,
  nearForearm: p.farForearm,
  farUpperArm: p.nearUpperArm,
  farForearm: p.nearForearm,
})

// Squat: hips move back first, shins and torso stay parallel, heels on the ground.
export const SQUAT_START = pose({ nearUpperArm: 8, farUpperArm: 8, nearForearm: 12, farForearm: 12 })

// Forward lunge: the back foot stays in place, the front foot takes a real step.
export const LUNGE_STEP = pose({
  torso: 4,
  hipX: 0.42,
  nearThigh: 50,
  nearShin: 15,
  farThigh: -3.2,
  farShin: -21.3,
  nearUpperArm: -18,
  nearForearm: 10,
  farUpperArm: 22,
  farForearm: 35,
})
export const LUNGE_LANDING = pose({
  torso: 2,
  hipX: 0.85,
  nearThigh: 41,
  nearShin: 37.4,
  nearFoot: 100,
  farThigh: 10.3,
  farShin: -68.3,
  farFoot: 35,
  nearUpperArm: -12,
  nearForearm: 5,
  farUpperArm: 15,
  farForearm: 25,
})
export const LUNGE_BOTTOM = pose({
  torso: 3,
  hipX: 1.15,
  nearThigh: 86,
  nearShin: -1.6,
  farThigh: 7.2,
  farShin: -102.8,
  farFoot: -10,
  nearUpperArm: -6,
  nearForearm: 5,
  farUpperArm: 6,
  farForearm: 10,
})

// Bulgarian split squat: back foot laces-down on the bench, vertical descent.
const bulgarianArms = (lean: number) => ({ nearUpperArm: lean * 0.3, nearForearm: lean * 0.3, farUpperArm: lean * 0.3, farForearm: lean * 0.3 })
export const BULGARIAN_TOP = pose({ torso: 12, hipX: -0.08, nearThigh: 42.4, nearShin: -11.2, farThigh: -22.7, farShin: -72.7, farFoot: -97, ...bulgarianArms(12) })
export const BULGARIAN_MID = pose({ torso: 15, hipX: -0.14, nearThigh: 62.5, nearShin: -20.3, farThigh: -16.4, farShin: -93.4, farFoot: -97, ...bulgarianArms(15) })
export const BULGARIAN_BOTTOM = pose({ torso: 18, hipX: -0.2, nearThigh: 82, nearShin: -23, farThigh: -17.5, farShin: -113.2, farFoot: -97, ...bulgarianArms(18) })

// Step-up: whole foot on the box, the top leg pushes, the free knee rises.
export const STEP_START = pose({
  torso: 14,
  hipX: 0.08,
  nearThigh: 60.3,
  nearShin: -19.2,
  farThigh: 11.5,
  farShin: -16.2,
  nearUpperArm: -12,
  nearForearm: 5,
  farUpperArm: 18,
  farForearm: 30,
})
export const STEP_DRIVE = pose({
  torso: 18,
  hipX: 0.36,
  nearThigh: 40.6,
  nearShin: -23,
  farThigh: -6.5,
  farShin: -10.1,
  farFoot: 50,
  nearUpperArm: -20,
  farUpperArm: 25,
  farForearm: 45,
})
export const STEP_LIFT = pose({
  torso: 10,
  hipX: 0.5,
  groundOffset: 0.5,
  nearThigh: 27.3,
  nearShin: -19.8,
  farThigh: 33.4,
  farShin: -39.1,
  farFoot: 70,
  nearUpperArm: 10,
  nearForearm: 50,
  farForearm: 20,
})
export const STEP_TOP = pose({
  torso: 3,
  hipX: 0.6,
  groundOffset: 0.5,
  nearThigh: 10.5,
  nearShin: -9.3,
  farThigh: 82,
  farShin: 2,
  nearUpperArm: 38,
  nearForearm: 95,
  farUpperArm: -28,
  farForearm: -5,
})

// Single-leg hip hinge (single-leg deadlift, airplane): supporting ankle fixed.
export const SINGLE_LEG_STAND = pose({ nearThigh: 3, nearShin: -2, hipX: -0.02, farThigh: -12, farShin: -28 })
export const SINGLE_LEG_HALF = pose({ torso: 45, nearThigh: 8, nearShin: -4, hipX: -0.07, farThigh: -48, farShin: -55 })
export const SINGLE_LEG_HINGE = pose({ torso: 84, nearThigh: 14, nearShin: -5, hipX: -0.16, farThigh: -95, farShin: -95, farFoot: -10 })

// Calf raises on a step: the forefoot stays on the edge of the step, the heel drops below it.
const calfArms = (a: number, f: number) => ({ nearUpperArm: a, nearForearm: f, farUpperArm: a, farForearm: f })
export const CALF_FLAT = pose({ groundOffset: 0.25, nearFoot: 90, farFoot: 90, ...calfArms(68, 80) })
export const CALF_TOP = pose({ groundOffset: 0.25, hipX: 0.06, nearFoot: 52, farFoot: 52, ...calfArms(62, 76) })
export const CALF_BOTTOM = pose({ groundOffset: 0.123, hipX: 0.03, nearFoot: 115, farFoot: 115, ...calfArms(72, 84) })

// Wall sit: back against the wall, knees at 90°, arms straight in front, breathing.
export const WALL_SIT = pose({ hipX: 0, nearThigh: 90, farThigh: 90, nearUpperArm: 88, nearForearm: 90, farUpperArm: 88, farForearm: 90 })
export const WALL_SIT_BREATH = pose({ torso: -1.5, hipX: 0, nearThigh: 90, farThigh: 90, nearUpperArm: 92, nearForearm: 93, farUpperArm: 92, farForearm: 93 })

// Balance on a cushion: soft supporting leg, free leg exploring, small torso corrections.
export const BALANCE_KNEE = pose({ groundOffset: 0.12, torso: 1, hipX: -0.07, nearThigh: 8, nearShin: -4, farThigh: 65, farShin: -5, nearUpperArm: 28, nearForearm: 45, farUpperArm: 20, farForearm: 40 })
export const BALANCE_FRONT = pose({ groundOffset: 0.12, torso: -3, hipX: -0.09, nearThigh: 10, nearShin: -5, farThigh: 42, farShin: 32, nearUpperArm: 22, nearForearm: 35, farUpperArm: 35, farForearm: 55 })
export const BALANCE_BACK = pose({ groundOffset: 0.12, torso: 9, hipX: -0.07, nearThigh: 10, nearShin: -6, farThigh: -24, farShin: -62, nearUpperArm: 40, nearForearm: 60, farUpperArm: 30, farForearm: 50 })
export const BALANCE_WOBBLE = pose({ groundOffset: 0.12, torso: 3, hipX: -0.08, nearThigh: 9, nearShin: -5, farThigh: 60, farShin: -12, nearUpperArm: 34, nearForearm: 50, farUpperArm: 16, farForearm: 36 })

// Airplane: hinge held, pelvic rotation shown by the arms (one to the sky, the other to the ground).
export const AIRPLANE_NEUTRAL = { ...SINGLE_LEG_HINGE, nearUpperArm: 5, nearForearm: 5, farUpperArm: -5, farForearm: -5 }
export const AIRPLANE_OPEN = { ...SINGLE_LEG_HINGE, torso: 80, nearUpperArm: 178, nearForearm: 178, farUpperArm: 0, farForearm: 0 }
export const AIRPLANE_CLOSED = { ...SINGLE_LEG_HINGE, torso: 86, nearUpperArm: 0, nearForearm: 0, farUpperArm: 178, farForearm: 178 }
