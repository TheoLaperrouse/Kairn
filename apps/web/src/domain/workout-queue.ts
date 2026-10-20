import type { Exercise, RoutineBlock } from './models'

/**
 * File d'étapes d'une séance guidée : chaque série (et chaque côté pour l'unilatéral)
 * devient une étape d'effort, suivie d'un repos — sauf après la toute dernière.
 */
export type Side = 'GAUCHE' | 'DROITE'

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
  /** Durée d'une répétition en secondes (rythme du compteur et de la démo). */
  repSec: number
  /** Durée d'un cycle complet de l'animation, calée sur le rythme des répétitions. */
  animationCycleMs: number
  /** Premier effort de ce bloc : annonce + compte à rebours de préparation. */
  firstOfBlock: boolean
  /** Compte à rebours de préparation avant l'effort (nouvel exercice ou changement de côté). */
  needsPrep: boolean
  lastSet: boolean
  notes?: string
}

export interface RestStep {
  kind: 'REPOS'
  blockIndex: number
  durationSec: number
  nextExerciseId: string
}

export type QueueStep = EffortStep | RestStep

const DEFAULT_REP_SEC = 2.5
export const PREP_SEC = 3

/** Durée d'une répétition depuis un tempo « 3-1-1 » (secondes par phase), sinon 2,5 s. */
export function repDuration(tempo?: string): number {
  if (!tempo) return DEFAULT_REP_SEC
  const parts = tempo.split(/[-–/ ]+/).map(Number)
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) return DEFAULT_REP_SEC
  const total = parts.reduce((a, b) => a + b, 0)
  return total > 0 ? total : DEFAULT_REP_SEC
}

/** Rythme naturel d'un exercice, tiré de son animation (cycle et répétitions par cycle). */
export interface ExerciseRhythm {
  cycleSec: number
  repsPerCycle: number
}

export function rhythmOf(exercise: Pick<Exercise, 'animation'>): ExerciseRhythm {
  return { cycleSec: exercise.animation.durationMs / 1000, repsPerCycle: exercise.animation.repsPerCycle ?? 1 }
}

/**
 * Durée d'une répétition : le tempo imposé par la routine s'il existe, sinon le rythme de l'animation
 * (une fente de chaque côté par cycle = deux répétitions), sinon 2,5 s.
 */
function repSecFor(tempo: string | undefined, rhythm: ExerciseRhythm | undefined): number {
  if (tempo) return repDuration(tempo)
  if (rhythm) return rhythm.cycleSec / rhythm.repsPerCycle
  return DEFAULT_REP_SEC
}

export function buildQueue(blocks: RoutineBlock[], rhythms: Record<string, ExerciseRhythm> = {}): QueueStep[] {
  const efforts: EffortStep[] = []
  blocks.forEach((block, blockIndex) => {
    const sides: Array<Side | undefined> = block.perSide ? ['GAUCHE', 'DROITE'] : [undefined]
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
          firstOfBlock: set === 1 && side !== 'DROITE',
          needsPrep: (set === 1 && side !== 'DROITE') || side === 'DROITE',
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
    // Entre les deux côtés d'une même série, pas de repos : on enchaîne après la préparation.
    if (effort.side === 'GAUCHE' && next.side === 'DROITE' && next.blockIndex === effort.blockIndex) return
    const rest = blocks[effort.blockIndex]!.restSec
    if (rest > 0) queue.push({ kind: 'REPOS', blockIndex: effort.blockIndex, durationSec: rest, nextExerciseId: next.exerciseId })
  })
  return queue
}

/** Durée estimée d'une étape, préparation comprise. */
export function stepDurationSec(step: QueueStep): number {
  if (step.kind === 'REPOS') return step.durationSec
  const work = step.durationSec ?? (step.reps ?? 10) * step.repSec
  return work + (step.needsPrep ? PREP_SEC : 0)
}

export function remainingSec(queue: QueueStep[], fromIndex: number): number {
  return queue.slice(fromIndex).reduce((sum, step) => sum + stepDurationSec(step), 0)
}
