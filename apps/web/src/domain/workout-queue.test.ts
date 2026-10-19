import { describe, expect, it } from 'vitest'
import { buildQueue, remainingSec, repDuration, stepDurationSec, type EffortStep } from './workout-queue'

describe('repDuration', () => {
  it('additionne les phases du tempo', () => {
    expect(repDuration('3-1-1')).toBe(5)
    expect(repDuration('4-0-1')).toBe(5)
  })
  it('retombe sur 2,5 s sans tempo exploitable', () => {
    expect(repDuration()).toBe(2.5)
    expect(repDuration('lent')).toBe(2.5)
    expect(repDuration('0-0-0')).toBe(2.5)
  })
})

describe('buildQueue', () => {
  it('alterne efforts et repos, sans repos final', () => {
    const queue = buildQueue([
      { exerciseId: 'squat', sets: 2, reps: 12, restSec: 45 },
      { exerciseId: 'planche', sets: 1, durationSec: 40, restSec: 30 },
    ])
    expect(queue.map((s) => s.kind)).toEqual(['EFFORT', 'REPOS', 'EFFORT', 'REPOS', 'EFFORT'])
    expect(queue.at(-1)).toMatchObject({ kind: 'EFFORT', exerciseId: 'planche', durationSec: 40 })
    expect(queue[3]).toMatchObject({ kind: 'REPOS', nextExerciseId: 'planche', durationSec: 45 })
  })

  it('enchaîne gauche puis droite sans repos pour l’unilatéral', () => {
    const queue = buildQueue([{ exerciseId: 'fente-bulgare', sets: 2, reps: 8, restSec: 60, perSide: true }])
    const shape = queue.map((s) => (s.kind === 'EFFORT' ? `${s.set}${s.side![0]}` : 'R'))
    expect(shape).toEqual(['1G', '1D', 'R', '2G', '2D'])
    const efforts = queue.filter((s): s is EffortStep => s.kind === 'EFFORT')
    expect(efforts.map((e) => e.needsPrep)).toEqual([true, true, false, true])
    expect(efforts.map((e) => e.lastSet)).toEqual([false, false, true, true])
  })

  it('privilégie la durée sur les répétitions et ignore les repos nuls', () => {
    const queue = buildQueue([
      { exerciseId: 'chaise', sets: 2, durationSec: 30, reps: 10, restSec: 0 },
    ])
    expect(queue).toHaveLength(2)
    expect((queue[0] as EffortStep).reps).toBeUndefined()
  })

  it('estime la durée restante (préparation incluse)', () => {
    const queue = buildQueue([{ exerciseId: 'squat-excentrique', sets: 1, reps: 6, tempo: '3-1-1', restSec: 60 }])
    expect(stepDurationSec(queue[0]!)).toBe(6 * 5 + 3)
    expect(remainingSec(queue, 0)).toBe(33)
  })
})

describe('rythme tiré de l’animation', () => {
  it('cale une répétition sur le cycle de l’animation quand la routine n’impose pas de tempo', () => {
    const rhythms = { 'fente-avant': { cycleSec: 5.6, repsPerCycle: 2 } }
    const [effort] = buildQueue([{ exerciseId: 'fente-avant', sets: 1, reps: 10, restSec: 30 }], rhythms) as EffortStep[]
    expect(effort!.repSec).toBeCloseTo(2.8)
    expect(effort!.animationCycleMs).toBeCloseTo(5600)
  })

  it('garde le tempo imposé et étire l’animation en conséquence', () => {
    const rhythms = { 'squat-excentrique': { cycleSec: 4.4, repsPerCycle: 1 } }
    const [effort] = buildQueue([{ exerciseId: 'squat-excentrique', sets: 1, reps: 6, tempo: '3-1-1', restSec: 60 }], rhythms) as EffortStep[]
    expect(effort!.repSec).toBe(5)
    expect(effort!.animationCycleMs).toBe(5000)
  })
})
