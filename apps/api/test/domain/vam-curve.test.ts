import { describe, expect, it } from 'vitest'
import { bestVam, buildVamProgress, vamCurve, vamRecords } from '../../src/domain/analysis/vam-curve'
import { anActivity, track } from '../fixtures/tracks'

describe('best VAM over a duration', () => {
  it('finds the best stretch, even in the middle of an uneven climb', () => {
    // 10 min at 600 m/h, then 6 min at 900 m/h, then 10 min at 600 m/h.
    const samples = track([
      { minutes: 10, km: 1, climbM: 100 },
      { minutes: 6, km: 0.6, climbM: 90 },
      { minutes: 10, km: 1, climbM: 100 },
    ])
    expect(bestVam(samples, 5)).toMatchObject({ vam: 900, elevationM: 75 })
    // Over 10 min, the window covers the 6 fast minutes and 4 min at 600 m/h: 90 + 40 m.
    expect(bestVam(samples, 10)!.vam).toBe(780)
    expect(bestVam(samples, 20)!.vam).toBe(690)
    expect(bestVam(samples, 30)).toBeUndefined()
  })

  it('ignores windows spanning a watch pause', () => {
    const before = track([{ minutes: 3, km: 0.3, climbM: 40 }])
    const after = track([{ minutes: 3, km: 0.3, climbM: 40 }], 540).map((s) => ({ ...s, t: s.t + 3600, d: s.d + 0.3 }))
    expect(bestVam([...before, ...after], 5)).toBeUndefined()
  })

  it('does not count a hilly easy run as a climb', () => {
    expect(vamCurve(track([{ minutes: 40, km: 7, climbM: 120 }]))).toEqual({})
  })
})

describe('progress and records', () => {
  const climbAt = (date: string, vamMinutes: number, id: string) =>
    anActivity(track([{ minutes: 10, km: 2 }, { minutes: vamMinutes, km: 2, climbM: 300 }, { minutes: 15, km: 2, climbM: -300 }]), {
      id,
      name: `Côte ${id}`,
      startTime: `${date}T07:00:00.000Z`,
    })

  it('tracks the weekly best VAM, records and trend', () => {
    const activities = [
      climbAt('2026-08-04', 36, 'a'), // 500 m/h
      climbAt('2026-08-18', 30, 'b'), // 600 m/h
      climbAt('2026-09-29', 30, 'c'),
      climbAt('2026-10-13', 25, 'd'), // 720 m/h
      anActivity(track([{ minutes: 30, km: 3, climbM: 400 }]), { id: 'bike', sport: 'BIKE', startTime: '2026-10-14T07:00:00.000Z' }),
    ]
    const progress = buildVamProgress(activities, '2026-10-19', 12)

    expect(progress.weeks).toHaveLength(12)
    expect(progress.weeks.at(-1)!.weekStart).toBe('2026-10-19')
    expect(progress.weeks.find((w) => w.weekStart === '2026-10-12')!.best[20]).toMatchObject({ vam: 720, activityId: 'd' })
    expect(progress.weeks.find((w) => w.weekStart === '2026-09-07')!.best).toEqual({})
    // The bike ride does not count: 800 m/h, but not on foot.
    expect(progress.records[20]).toMatchObject({ vam: 720, activityId: 'd', date: '2026-10-13' })
    // Last 4 weeks (since Sept 28): 720; previous 8 weeks: 600.
    expect(progress.trend[20]).toEqual({ recent: 720, previous: 600, deltaPct: 20 })
    // Over 30 min, climb "c" (30 min at 600 m/h) equals the baseline: stable trend.
    expect(progress.trend[30]).toEqual({ recent: 600, previous: 600, deltaPct: 0 })
  })

  it('announces a record only if it beats a previous run', () => {
    const first = climbAt('2026-10-01', 30, 'first')
    expect(vamRecords(first, [first])).toEqual([])
    const better = climbAt('2026-10-08', 25, 'better')
    const records = vamRecords(better, [first, better])
    expect(records.map((r) => [r.effort.minutes, r.effort.vam, r.previous])).toEqual([
      [5, 720, 600],
      [10, 720, 600],
      [20, 720, 600],
    ])
    expect(vamRecords(first, [first, better])).toEqual([])
  })
})
