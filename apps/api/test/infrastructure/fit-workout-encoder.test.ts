import FitParser from 'fit-file-parser'
import { describe, expect, it } from 'vitest'
import { toWorkoutDefinition } from '../../src/domain/plan/workout-definition'
import type { PlannedSession } from '../../src/domain/plan/training-plan'
import { FitWorkoutEncoder, fitCrc } from '../../src/infrastructure/fit/fit-workout-encoder'

const hills: PlannedSession = {
  id: 's1',
  weekIndex: 0,
  date: '2027-03-02',
  type: 'COTES_COURTES',
  sport: 'RUN',
  title: 'Côtes courtes (VMA en montée)',
  objective: '',
  durationMin: 55,
  zone: 5,
  keySession: true,
  tips: [],
  status: 'PLANNED',
  steps: [
    { kind: 'ECHAUFFEMENT', label: 'Footing progressif', durationMin: 15, zone: 2 },
    { kind: 'EFFORT', label: '30" vif en côte', durationMin: 0.5, zone: 5, repeat: 10 },
    { kind: 'RECUP', label: 'Redescente en trottinant', durationMin: 1.5, zone: 1, repeat: 10 },
    { kind: 'RETOUR_CALME', label: 'Retour au calme', durationMin: 10, zone: 1 },
  ],
}

describe('session export to the watch (FIT workout)', () => {
  it('groups repeated effort + recovery into a repeat block', () => {
    const workout = toWorkoutDefinition(hills)
    expect(workout.items.map((i) => i.kind)).toEqual(['STEP', 'REPEAT', 'STEP'])
    const repeat = workout.items[1]!
    expect(repeat.kind === 'REPEAT' && repeat.times).toBe(10)
  })

  it('produces a valid FIT file, read back by an independent parser', async () => {
    const buffer = new FitWorkoutEncoder(() => new Date('2027-03-01T08:00:00Z')).encode(toWorkoutDefinition(hills))
    expect(buffer.subarray(8, 12).toString('ascii')).toBe('.FIT')
    // The CRC over the whole file (trailing CRC included) must be zero.
    expect(fitCrc(buffer)).toBe(0)

    const parsed = (await new FitParser({ force: false, mode: "list" }).parseAsync(buffer as Buffer<ArrayBuffer>)) as unknown as Record<string, unknown>
    // This parser keeps the list of file_id messages but only the last workout_step read.
    expect((parsed.file_ids as Array<Record<string, unknown>>)[0]).toMatchObject({ type: 'workout' })
    expect(parsed.workout).toMatchObject({ wkt_name: 'Côtes courtes (VMA en montée)', sport: 'running', num_valid_steps: 5 })
    expect(parsed.workout_step).toMatchObject({
      wkt_step_name: 'Retour au calme',
      duration_type: 'time',
      duration_value: 600_000,
      target_type: 'heart_rate',
      target_value: 1,
      intensity: 'cooldown',
    })
  })

  it('rejects race day and strength sessions', () => {
    expect(() => toWorkoutDefinition({ ...hills, type: 'COURSE' })).toThrow()
    expect(() => toWorkoutDefinition({ ...hills, sport: 'STRENGTH', type: 'RENFORCEMENT' })).toThrow()
  })
})
