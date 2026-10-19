import type { Pose } from '../../../domain/strength/exercise'
import { pose } from './poses'

/** Inverse côté proche / côté éloigné, pieds compris (alternance des jambes et des bras). */
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

/** Position horizontale du bassin pour que la cheville proche reste à `ankleX` (appui fixe au sol). */
export const hipForAnkle = (ankleX: number, thigh: number, shin: number): number =>
  ankleX - Math.sin((thigh * Math.PI) / 180) - Math.sin((shin * Math.PI) / 180)

/** Pose avec la cheville proche ancrée à `ankleX`. */
export const anchored = (ankleX: number, overrides: Partial<Pose>): Pose => {
  const base = pose(overrides)
  return { ...base, hipX: hipForAnkle(ankleX, base.nearThigh, base.nearShin) }
}
