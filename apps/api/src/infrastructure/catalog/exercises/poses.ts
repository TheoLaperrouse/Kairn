import type { Pose } from '../../../domain/strength/exercise'

/** Debout, bras le long du corps : base dont dérivent toutes les poses. */
export const STAND: Pose = {
  torso: 0,
  nearUpperArm: 0,
  nearForearm: 0,
  farUpperArm: 0,
  farForearm: 0,
  nearThigh: 0,
  nearShin: 0,
  farThigh: 0,
  farShin: 0,
}

export const pose = (overrides: Partial<Pose>): Pose => ({ ...STAND, ...overrides })

/** Inverse jambes et bras near/far (pour alterner les côtés). */
export const mirror = (p: Pose): Pose => ({
  ...p,
  nearThigh: p.farThigh,
  nearShin: p.farShin,
  farThigh: p.nearThigh,
  farShin: p.nearShin,
  nearUpperArm: p.farUpperArm,
  nearForearm: p.farForearm,
  farUpperArm: p.nearUpperArm,
  farForearm: p.nearForearm,
})

// Poses partagées
export const SQUAT_BOTTOM = pose({
  torso: 40,
  nearThigh: 80,
  nearShin: -30,
  farThigh: 80,
  farShin: -30,
  nearUpperArm: 90,
  nearForearm: 90,
  farUpperArm: 90,
  farForearm: 90,
  hipX: -0.48,
})
export const SQUAT_MID = pose({
  torso: 22,
  nearThigh: 45,
  nearShin: -18,
  farThigh: 45,
  farShin: -18,
  nearUpperArm: 60,
  nearForearm: 70,
  farUpperArm: 60,
  farForearm: 70,
  hipX: -0.4,
})
export const LUNGE_DOWN = pose({
  nearThigh: 85,
  nearShin: 0,
  farThigh: -15,
  farShin: -100,
  nearUpperArm: -15,
  nearForearm: 10,
  farUpperArm: 20,
  farForearm: 40,
})
export const KNEEL_SHIN = -108
export const PLANK = pose({
  torso: 84,
  nearUpperArm: 0,
  nearForearm: 90,
  farUpperArm: 0,
  farForearm: 90,
  nearThigh: -84,
  nearShin: -84,
  farThigh: -84,
  farShin: -84,
})
// Allongé sur le dos : tête à gauche (torse ≈ -90), face vers le haut.
export const SUPINE_TABLETOP = pose({
  torso: -84,
  nearUpperArm: 180,
  nearForearm: 180,
  farUpperArm: 180,
  farForearm: 180,
  nearThigh: 180,
  nearShin: 90,
  farThigh: 180,
  farShin: 90,
})
export const QUADRUPED = pose({
  torso: 79,
  nearUpperArm: 0,
  nearForearm: 0,
  farUpperArm: 0,
  farForearm: 0,
  nearThigh: 0,
  nearShin: -105,
  farThigh: 0,
  farShin: -105,
})
export const HINGE_SINGLE_LEG = pose({
  torso: 85,
  nearThigh: 12,
  nearShin: -5,
  farThigh: -95,
  farShin: -95,
  nearUpperArm: 0,
  nearForearm: 0,
  farUpperArm: 0,
  farForearm: 0,
})
