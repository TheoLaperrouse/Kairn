import type { Exercise } from '../../../domain/strength/exercise'
import { CORE_EXERCISES } from './core'
import { STRENGTH_EXERCISES } from './strength'
import { ECCENTRIC_EXERCISES } from './eccentric'
import { PLYOMETRIC_EXERCISES } from './plyometrics'
import { PROPRIOCEPTION_EXERCISES } from './proprioception'
import { MOBILITY_EXERCISES } from './mobility'

export const EXERCISES: Exercise[] = [
  ...CORE_EXERCISES,
  ...STRENGTH_EXERCISES,
  ...ECCENTRIC_EXERCISES,
  ...PLYOMETRIC_EXERCISES,
  ...PROPRIOCEPTION_EXERCISES,
  ...MOBILITY_EXERCISES,
]
