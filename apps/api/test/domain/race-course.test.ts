import { describe, expect, it } from 'vitest'
import { buildProfile, courseStats, planRace, snapToTrack, type RaceCourse } from '../../src/domain/race-course/race-course'
import { GpxCourseParser } from '../../src/infrastructure/parsers/course-gpx-parser'
import { syntheticCourseGpx } from '../fixtures/course-gpx'
import { aGoal } from '../fixtures/factories'

function course(): RaceCourse {
  const file = new GpxCourseParser().parse(Buffer.from(syntheticCourseGpx()))
  const points = buildProfile(file.track)
  return {
    name: file.name,
    uploadedAt: '',
    points,
    ...courseStats(points),
    aidStations: file.waypoints.map((w) => ({ name: w.name, km: snapToTrack(file.track, w), major: /base de vie/i.test(w.name) })),
    settings: { startTime: '05:00', temperatureC: 15, sweat: 'MOYEN', gut: 'PARTIEL', weightKg: 70 },
  }
}

const goal = aGoal({ technicity: 3, targetTimeH: undefined })

describe('race plan from the official GPX', () => {
  it('reads the track and places aid stations on the course', () => {
    const c = course()
    expect(c.name).toBe('Trail test 30K')
    expect(c.totalDistanceKm).toBeCloseTo(30, 0)
    expect(c.elevationGainM).toBeGreaterThan(950)
    expect(c.elevationGainM).toBeLessThan(1050)
    expect(c.aidStations.map((a) => Math.round(a.km))).toEqual([10, 20])
  })

  it('splits the profile into climb, descent and runnable section', () => {
    const plan = planRace(course(), goal, 'INTERMEDIAIRE')
    expect(plan.segments.map((s) => s.kind)).toEqual(['MONTEE', 'DESCENTE', 'ROULANT'])
    expect(plan.segments[0]!.avgGradePct).toBeCloseTo(10, 0)
  })

  it('computes increasing split times, slower uphill than on the flat', () => {
    const plan = planRace(course(), goal, 'INTERMEDIAIRE')
    expect(plan.splits.map((s) => s.name)).toEqual(['Ravito du sommet', 'Base de vie', 'Arrivée'])
    const [climb, , flat] = plan.splits
    expect(climb!.legDurationH).toBeGreaterThan(flat!.legDurationH)
    expect(plan.splits.every((s, i) => i === 0 || s.elapsedH > plan.splits[i - 1]!.elapsedH)).toBe(true)
    expect(plan.splits[0]!.clock).toMatch(/^0[5-9]:\d{2}$/)
    expect(plan.totalH).toBeCloseTo(plan.splits.at(-1)!.elapsedH, 2)
  })

  it('plans the food to carry on each section', () => {
    const plan = planRace(course(), goal, 'INTERMEDIAIRE')
    for (const split of plan.splits) {
      expect(split.nutrition.carbsG).toBeGreaterThan(0)
      expect(split.nutrition.carry.length).toBeGreaterThan(0)
    }
  })

  it('warns when a cutoff time is at risk', () => {
    const c = course()
    c.aidStations[0]!.cutoffH = 0.5
    const plan = planRace(c, goal, 'INTERMEDIAIRE')
    expect(plan.splits[0]!.marginH).toBeLessThan(0)
    expect(plan.warnings.join(' ')).toMatch(/Barrière horaire/)
  })
})
