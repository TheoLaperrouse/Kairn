import { describe, expect, it } from 'vitest'
import { bestRehearsal, localClimbs, withRehearsals } from '../../src/domain/race-course/climb-rehearsal'
import type { CourseSegment } from '../../src/domain/race-course/race-course'
import { anActivity, track } from '../fixtures/tracks'

const today = '2027-03-10'

/** Warm-up, one hill climbed and run back down, cool-down. */
function hillRun(id: string, climbM: number, km: number, overrides = {}) {
  const samples = track([
    { minutes: 10, km: 2 },
    { minutes: 8, km, climbM },
    { minutes: 5, km, climbM: -climbM },
    { minutes: 10, km: 2 },
  ])
  return anActivity(samples, { id, name: `Côte ${id}`, startTime: '2027-03-01T08:00:00.000Z', ...overrides })
}

function raceSegment(overrides: Partial<CourseSegment> = {}): CourseSegment {
  return {
    kind: 'UPHILL',
    startKm: 2,
    endKm: 12,
    gainM: 1000,
    lossM: 0,
    avgGradePct: 10,
    startElapsedH: 0.3,
    durationH: 2,
    key: true,
    ...overrides,
  }
}

describe('local rehearsal of race climbs', () => {
  it('finds the short hills of the past year, climbs and descents alike', () => {
    const { climbs, descents } = localClimbs([hillRun('a', 40, 0.4)], today)
    expect(climbs).toHaveLength(1)
    expect(climbs[0]).toMatchObject({ activityId: 'a', activityName: 'Côte a', date: '2027-03-01' })
    expect(climbs[0]!.elevationM).toBeCloseTo(40, -1)
    expect(climbs[0]!.gradePct).toBeCloseTo(10, 0)
    expect(descents).toHaveLength(1)
  })

  it('ignores bike rides, tracks older than a year and future dates', () => {
    const activities = [
      hillRun('bike', 80, 0.8, { sport: 'BIKE' }),
      hillRun('old', 80, 0.8, { startTime: '2025-12-01T08:00:00.000Z' }),
      hillRun('future', 80, 0.8, { startTime: '2027-04-01T08:00:00.000Z' }),
    ]
    expect(localClimbs(activities, today).climbs).toEqual([])
  })

  it('prefers the biggest hill with a similar grade, and counts the repetitions', () => {
    const { climbs } = localClimbs([hillRun('small', 40, 0.4), hillRun('big', 80, 0.8), hillRun('steep', 160, 0.8)], today)
    const rehearsal = bestRehearsal(raceSegment(), climbs)!
    expect(rehearsal.local.activityId).toBe('big')
    expect(rehearsal.repetitions).toBe(Math.ceil(1000 / rehearsal.local.elevationM))
    expect(Math.abs(rehearsal.gradeGapPct)).toBeLessThan(1)
    expect(rehearsal.estimatedDurationH).toBeCloseTo(1000 / rehearsal.local.verticalSpeed, 1)
  })

  it('falls back to the closest grade when no local hill is as steep as the race', () => {
    const { climbs } = localClimbs([hillRun('gentle', 30, 0.75), hillRun('flatter', 30, 1.5)], today)
    const rehearsal = bestRehearsal(raceSegment({ avgGradePct: 15 }), climbs)!
    expect(rehearsal.local.activityId).toBe('gentle')
    expect(rehearsal.gradeGapPct).toBeLessThan(-3)
  })

  it('rehearses descents on descents, and only key segments', () => {
    const activities = [hillRun('a', 80, 0.8)]
    const [climb, descent, minor, flat] = withRehearsals(
      [
        raceSegment(),
        raceSegment({ kind: 'DOWNHILL', gainM: 0, lossM: 800, avgGradePct: -12 }),
        raceSegment({ gainM: 100, key: false }),
        raceSegment({ kind: 'FLAT', gainM: 0, avgGradePct: 0 }),
      ],
      activities,
      today,
    )
    expect(climb!.rehearsal?.local.elevationM).toBeCloseTo(80, -1)
    expect(descent!.rehearsal?.repetitions).toBe(Math.ceil(800 / descent!.rehearsal!.local.elevationM))
    expect(descent!.rehearsal!.local.verticalSpeed).toBeGreaterThan(climb!.rehearsal!.local.verticalSpeed)
    expect(minor!.rehearsal).toBeUndefined()
    expect(flat!.rehearsal).toBeUndefined()
  })

  it('leaves the race plan unchanged without any hilly run', () => {
    const segments = [raceSegment()]
    expect(withRehearsals(segments, [anActivity(track([{ minutes: 40, km: 8 }]))], today)).toEqual(segments)
  })
})
