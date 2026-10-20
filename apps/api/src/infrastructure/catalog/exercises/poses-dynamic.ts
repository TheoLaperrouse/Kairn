import type { Pose } from '../../../domain/strength/exercise'
import { pose } from './poses'

/** Swaps near and far sides, feet included (alternating legs and arms). */
export const swapSides = (p: Pose): Pose => ({
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

/** Horizontal pelvis position so the near ankle stays at `ankleX` (fixed ground contact). */
export const hipForAnkle = (ankleX: number, thigh: number, shin: number): number =>
  ankleX - Math.sin((thigh * Math.PI) / 180) - Math.sin((shin * Math.PI) / 180)

export const anchored = (ankleX: number, overrides: Partial<Pose>): Pose => {
  const base = pose(overrides)
  return { ...base, hipX: hipForAnkle(ankleX, base.nearThigh, base.nearShin) }
}
