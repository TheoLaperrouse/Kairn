import type { Exercise, RoutineBlock } from './models'

/**
 * Step queue of a guided session: each set (and each side for unilateral work)
 * becomes an effort step followed by a rest, except after the very last one.
 */
export type Side = 'LEFT' | 'RIGHT'

export interface EffortStep {
  kind: 'EFFORT'
  blockIndex: number
  exerciseId: string
  set: number
  totalSets: number
  side?: Side
  reps?: number
  durationSec?: number
  tempo?: string
  /** Duration of one rep in seconds (pace of the counter and the demo). */
  repSec: number
  /** Duration of a full animation cycle, synced to the rep pace. */
  animationCycleMs: number
  /** First effort of this block: announcement + prep countdown. */
  firstOfBlock: boolean
  /** Prep countdown before the effort (new exercise or side switch). */
  needsPrep: boolean
  lastSet: boolean
  notes?: string
}

export interface RestStep {
  kind: 'REST'
  blockIndex: number
  durationSec: number
  nextExerciseId: string
}

export type QueueStep = EffortStep | RestStep

const DEFAULT_REP_SEC = 2.5
export const PREP_SEC = 3

/** Rep duration from a "3-1-1" tempo (seconds per phase), otherwise 2.5 s. */
export function repDuration(tempo?: string): number {
  if (!tempo) return DEFAULT_REP_SEC
  const parts = tempo.split(/[-–/ ]+/).map(Number)
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) return DEFAULT_REP_SEC
  const total = parts.reduce((a, b) => a + b, 0)
  return total > 0 ? total : DEFAULT_REP_SEC
}

/** Natural rhythm of an exercise, taken from its animation (cycle and reps per cycle). */
export interface ExerciseRhythm {
  cycleSec: number
  repsPerCycle: number
}

export function rhythmOf(exercise: Pick<Exercise, 'animation'>): ExerciseRhythm {
  return { cycleSec: exercise.animation.durationMs / 1000, repsPerCycle: exercise.animation.repsPerCycle ?? 1 }
}

/**
 * Rep duration: the tempo set by the routine if any, otherwise the animation's rhythm
 * (one lunge per side per cycle = two reps), otherwise 2.5 s.
 */
function repSecFor(tempo: string | undefined, rhythm: ExerciseRhythm | undefined): number {
  if (tempo) return repDuration(tempo)
  if (rhythm) return rhythm.cycleSec / rhythm.repsPerCycle
  return DEFAULT_REP_SEC
}

export function buildQueue(blocks: RoutineBlock[], rhythms: Record<string, ExerciseRhythm> = {}): QueueStep[] {
  const efforts: EffortStep[] = []
  blocks.forEach((block, blockIndex) => {
    const sides: Array<Side | undefined> = block.perSide ? ['LEFT', 'RIGHT'] : [undefined]
    const sets = Math.max(1, block.sets)
    for (let set = 1; set <= sets; set++) {
      for (const side of sides) {
        efforts.push({
          kind: 'EFFORT',
          blockIndex,
          exerciseId: block.exerciseId,
          set,
          totalSets: sets,
          side,
          reps: block.durationSec ? undefined : block.reps,
          durationSec: block.durationSec,
          tempo: block.tempo,
          repSec: repSecFor(block.tempo, rhythms[block.exerciseId]),
          animationCycleMs: repSecFor(block.tempo, rhythms[block.exerciseId]) * (rhythms[block.exerciseId]?.repsPerCycle ?? 1) * 1000,
          firstOfBlock: set === 1 && side !== 'RIGHT',
          needsPrep: (set === 1 && side !== 'RIGHT') || side === 'RIGHT',
          lastSet: set === sets,
          notes: block.notes,
        })
      }
    }
  })

  const queue: QueueStep[] = []
  efforts.forEach((effort, i) => {
    queue.push(effort)
    const next = efforts[i + 1]
    if (!next) return
    // No rest between the two sides of a set: go straight on after the prep.
    if (effort.side === 'LEFT' && next.side === 'RIGHT' && next.blockIndex === effort.blockIndex) return
    const rest = blocks[effort.blockIndex]!.restSec
    if (rest > 0) queue.push({ kind: 'REST', blockIndex: effort.blockIndex, durationSec: rest, nextExerciseId: next.exerciseId })
  })
  return queue
}

/** Estimated duration of a step, prep included. */
export function stepDurationSec(step: QueueStep): number {
  if (step.kind === 'REST') return step.durationSec
  const work = step.durationSec ?? (step.reps ?? 10) * step.repSec
  return work + (step.needsPrep ? PREP_SEC : 0)
}

export function remainingSec(queue: QueueStep[], fromIndex: number): number {
  return queue.slice(fromIndex).reduce((sum, step) => sum + stepDurationSec(step), 0)
}
