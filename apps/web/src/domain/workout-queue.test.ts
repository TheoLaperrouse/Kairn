import { describe, expect, it } from 'vitest'
import { buildQueue, remainingSec, repDuration, stepDurationSec, type EffortStep } from './workout-queue'

describe('repDuration', () => {
  it('sums the tempo phases', () => {
    expect(repDuration('3-1-1')).toBe(5)
    expect(repDuration('4-0-1')).toBe(5)
  })
  it('falls back to 2.5 s without a usable tempo', () => {
    expect(repDuration()).toBe(2.5)
    expect(repDuration('lent')).toBe(2.5)
    expect(repDuration('0-0-0')).toBe(2.5)
  })
})

describe('buildQueue', () => {
  it('alternates efforts and rests, with no final rest', () => {
    const queue = buildQueue([
      { exerciseId: 'squat', sets: 2, reps: 12, restSec: 45 },
      { exerciseId: 'planche', sets: 1, durationSec: 40, restSec: 30 },
    ])
    expect(queue.map((s) => s.kind)).toEqual(['EFFORT', 'REPOS', 'EFFORT', 'REPOS', 'EFFORT'])
    expect(queue.at(-1)).toMatchObject({ kind: 'EFFORT', exerciseId: 'planche', durationSec: 40 })
    expect(queue[3]).toMatchObject({ kind: 'REPOS', nextExerciseId: 'planche', durationSec: 45 })
  })

  it('chains left then right without rest for unilateral exercises', () => {
    const queue = buildQueue([{ exerciseId: 'fente-bulgare', sets: 2, reps: 8, restSec: 60, perSide: true }])
    const shape = queue.map((s) => (s.kind === 'EFFORT' ? `${s.set}${s.side![0]}` : 'R'))
    expect(shape).toEqual(['1G', '1D', 'R', '2G', '2D'])
    const efforts = queue.filter((s): s is EffortStep => s.kind === 'EFFORT')
    expect(efforts.map((e) => e.needsPrep)).toEqual([true, true, false, true])
    expect(efforts.map((e) => e.lastSet)).toEqual([false, false, true, true])
  })

  it('prefers duration over reps and ignores zero rests', () => {
    const queue = buildQueue([
      { exerciseId: 'chaise', sets: 2, durationSec: 30, reps: 10, restSec: 0 },
    ])
    expect(queue).toHaveLength(2)
    expect((queue[0] as EffortStep).reps).toBeUndefined()
  })

  it('estimates the remaining time (prep included)', () => {
    const queue = buildQueue([{ exerciseId: 'squat-excentrique', sets: 1, reps: 6, tempo: '3-1-1', restSec: 60 }])
    expect(stepDurationSec(queue[0]!)).toBe(6 * 5 + 3)
    expect(remainingSec(queue, 0)).toBe(33)
  })
})

describe('rhythm derived from the animation', () => {
  it('syncs a rep to the animation cycle when the routine sets no tempo', () => {
    const rhythms = { 'fente-avant': { cycleSec: 5.6, repsPerCycle: 2 } }
    const [effort] = buildQueue([{ exerciseId: 'fente-avant', sets: 1, reps: 10, restSec: 30 }], rhythms) as EffortStep[]
    expect(effort!.repSec).toBeCloseTo(2.8)
    expect(effort!.animationCycleMs).toBeCloseTo(5600)
  })

  it('keeps the prescribed tempo and stretches the animation to match', () => {
    const rhythms = { 'squat-excentrique': { cycleSec: 4.4, repsPerCycle: 1 } }
    const [effort] = buildQueue([{ exerciseId: 'squat-excentrique', sets: 1, reps: 6, tempo: '3-1-1', restSec: 60 }], rhythms) as EffortStep[]
    expect(effort!.repSec).toBe(5)
    expect(effort!.animationCycleMs).toBe(5000)
  })
})
