import type { Pose } from '../../../domain/strength/exercise'
import { pose } from './poses'

/**
 * Poses des exercices de force et de proprioception, calculées par cinématique inverse pour que
 * les appuis restent fixes au sol (pied d'appui, pied sur la box ou le banc) pendant tout le mouvement.
 */

/** Inverse côté proche et côté éloigné, pieds compris (alternance gauche / droite). */
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

// Squat : les hanches reculent d'abord, tibias et buste restent parallèles, talons au sol.
export const SQUAT_START = pose({ nearUpperArm: 8, farUpperArm: 8, nearForearm: 12, farForearm: 12 })

// Fente avant : le pied arrière reste en place, le pied avant fait un vrai pas.
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

// Fente bulgare : pied arrière lacets sur le banc, descente verticale.
const bulgarianArms = (lean: number) => ({ nearUpperArm: lean * 0.3, nearForearm: lean * 0.3, farUpperArm: lean * 0.3, farForearm: lean * 0.3 })
export const BULGARIAN_TOP = pose({ torso: 12, hipX: -0.08, nearThigh: 42.4, nearShin: -11.2, farThigh: -22.7, farShin: -72.7, farFoot: -97, ...bulgarianArms(12) })
export const BULGARIAN_MID = pose({ torso: 15, hipX: -0.14, nearThigh: 62.5, nearShin: -20.3, farThigh: -16.4, farShin: -93.4, farFoot: -97, ...bulgarianArms(15) })
export const BULGARIAN_BOTTOM = pose({ torso: 18, hipX: -0.2, nearThigh: 82, nearShin: -23, farThigh: -17.5, farShin: -113.2, farFoot: -97, ...bulgarianArms(18) })

// Step-up : pied entier sur la box, la jambe du haut pousse, le genou libre monte.
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

// Charnière de hanche sur une jambe (soulevé de terre unipodal, avion) : cheville d'appui fixe.
export const SINGLE_LEG_STAND = pose({ nearThigh: 3, nearShin: -2, hipX: -0.02, farThigh: -12, farShin: -28 })
export const SINGLE_LEG_HALF = pose({ torso: 45, nearThigh: 8, nearShin: -4, hipX: -0.07, farThigh: -48, farShin: -55 })
export const SINGLE_LEG_HINGE = pose({ torso: 84, nearThigh: 14, nearShin: -5, hipX: -0.16, farThigh: -95, farShin: -95, farFoot: -10 })

// Mollets sur marche : l'avant-pied reste sur le bord de la marche, le talon passe dessous.
const calfArms = (a: number, f: number) => ({ nearUpperArm: a, nearForearm: f, farUpperArm: a, farForearm: f })
export const CALF_FLAT = pose({ groundOffset: 0.25, nearFoot: 90, farFoot: 90, ...calfArms(68, 80) })
export const CALF_TOP = pose({ groundOffset: 0.25, hipX: 0.06, nearFoot: 52, farFoot: 52, ...calfArms(62, 76) })
export const CALF_BOTTOM = pose({ groundOffset: 0.123, hipX: 0.03, nearFoot: 115, farFoot: 115, ...calfArms(72, 84) })

// Chaise : dos au mur, genoux à 90°, bras tendus devant, respiration.
export const WALL_SIT = pose({ hipX: 0, nearThigh: 90, farThigh: 90, nearUpperArm: 88, nearForearm: 90, farUpperArm: 88, farForearm: 90 })
export const WALL_SIT_BREATH = pose({ torso: -1.5, hipX: 0, nearThigh: 90, farThigh: 90, nearUpperArm: 92, nearForearm: 93, farUpperArm: 92, farForearm: 93 })

// Équilibre sur coussin : jambe d'appui souple, jambe libre qui explore, petites corrections du buste.
export const BALANCE_KNEE = pose({ groundOffset: 0.12, torso: 1, hipX: -0.07, nearThigh: 8, nearShin: -4, farThigh: 65, farShin: -5, nearUpperArm: 28, nearForearm: 45, farUpperArm: 20, farForearm: 40 })
export const BALANCE_FRONT = pose({ groundOffset: 0.12, torso: -3, hipX: -0.09, nearThigh: 10, nearShin: -5, farThigh: 42, farShin: 32, nearUpperArm: 22, nearForearm: 35, farUpperArm: 35, farForearm: 55 })
export const BALANCE_BACK = pose({ groundOffset: 0.12, torso: 9, hipX: -0.07, nearThigh: 10, nearShin: -6, farThigh: -24, farShin: -62, nearUpperArm: 40, nearForearm: 60, farUpperArm: 30, farForearm: 50 })
export const BALANCE_WOBBLE = pose({ groundOffset: 0.12, torso: 3, hipX: -0.08, nearThigh: 9, nearShin: -5, farThigh: 60, farShin: -12, nearUpperArm: 34, nearForearm: 50, farUpperArm: 16, farForearm: 36 })

// Avion : charnière tenue, la rotation du bassin se lit aux bras (un vers le ciel, l'autre vers le sol).
export const AIRPLANE_NEUTRAL = { ...SINGLE_LEG_HINGE, nearUpperArm: 5, nearForearm: 5, farUpperArm: -5, farForearm: -5 }
export const AIRPLANE_OPEN = { ...SINGLE_LEG_HINGE, torso: 80, nearUpperArm: 178, nearForearm: 178, farUpperArm: 0, farForearm: 0 }
export const AIRPLANE_CLOSED = { ...SINGLE_LEG_HINGE, torso: 86, nearUpperArm: 0, nearForearm: 0, farUpperArm: 178, farForearm: 178 }
