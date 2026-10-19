import type { Exercise } from '../../../domain/strength/exercise'
import { GAINAGE } from './gainage'
import { FORCE } from './force'
import { EXCENTRIQUE } from './excentrique'
import { PLIOMETRIE } from './pliometrie'
import { PROPRIOCEPTION } from './proprioception'
import { MOBILITE } from './mobilite'

export const EXERCISES: Exercise[] = [...GAINAGE, ...FORCE, ...EXCENTRIQUE, ...PLIOMETRIE, ...PROPRIOCEPTION, ...MOBILITE]
