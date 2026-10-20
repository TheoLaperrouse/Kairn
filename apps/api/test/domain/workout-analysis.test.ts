import { describe, expect, it } from 'vitest'
import { resampleTrack } from '../../src/domain/activity/activity'
import { detectClimbs, movingSeconds } from '../../src/domain/analysis/climbs'
import { heartRateZones, timeInZones, zoneOf } from '../../src/domain/analysis/heart-rate-zones'
import { analyzeWorkout } from '../../src/domain/analysis/workout-analysis'
import { aSession, anActivity, track } from '../fixtures/tracks'

// Resting HR 50, max 190: Karvonen zones Z2 ≥ 134, Z3 ≥ 148, Z4 ≥ 162, Z5 ≥ 176.
const profile = { hrMax: 190, hrRest: 50 }

describe('detailed track', () => {
  it('resamples to 10 s, averaging HR and altitude', () => {
    const raw = Array.from({ length: 61 }, (_, i) => ({ t: 1000 + i, d: i / 1000, alt: 100 + i, hr: i % 2 ? 150 : 140 }))
    const samples = resampleTrack(raw)
    expect(samples).toHaveLength(7)
    expect(samples[0]).toEqual({ t: 10, d: 0.009, alt: 104.5, hr: 145 })
    expect(samples.at(-1)!.d).toBe(0.06)
  })

  it('caps the track size of an ultra', () => {
    const raw = Array.from({ length: 20 * 3600 }, (_, i) => ({ t: i, d: i / 400, alt: 1000, hr: 130 }))
    expect(resampleTrack(raw).length).toBeLessThanOrEqual(1201)
  })

  it('ignores outlier HR values', () => {
    const samples = resampleTrack([
      { t: 0, d: 0, hr: 255 },
      { t: 5, d: 0.01, hr: 20 },
      { t: 12, d: 0.02, hr: 140 },
    ])
    expect(samples[0]!.hr).toBeUndefined()
    expect(samples[1]!.hr).toBe(140)
  })
})

describe('heart rate zones', () => {
  it('uses heart rate reserve when resting HR is known, otherwise % of max HR', () => {
    expect(heartRateZones(profile)).toEqual({ method: 'RESERVE', bounds: [134, 148, 162, 176] })
    expect(heartRateZones({ hrMax: 200 })).toEqual({ method: 'MAX', bounds: [120, 140, 160, 180] })
    expect(heartRateZones({})).toBeUndefined()
    expect(zoneOf(133, heartRateZones(profile)!)).toBe(1)
    expect(zoneOf(170, heartRateZones(profile)!)).toBe(4)
  })

  it('counts time in zones excluding watch pauses', () => {
    const samples = [...track([{ minutes: 10, km: 2, hr: 140 }]), { t: 1200, d: 2, hr: 170 }, { t: 1210, d: 2.03, hr: 170 }]
    const time = timeInZones(samples, heartRateZones(profile)!)
    expect(time[2]).toBe(600)
    expect(time[4]).toBe(10)
  })
})

describe('climbs and descents', () => {
  const samples = track([
    { minutes: 10, km: 2, hr: 140 },
    { minutes: 30, km: 3, climbM: 300, hr: 155 },
    { minutes: 5 },
    { minutes: 20, km: 3, climbM: -300, hr: 140 },
  ])

  it('measures VAM without counting the stop at the top', () => {
    const { climbs, descents } = detectClimbs(samples)
    expect(climbs).toHaveLength(1)
    expect(climbs[0]).toMatchObject({ elevationM: 300, durationSec: 1800, verticalSpeed: 600, gradePct: 10, startKm: 2, endKm: 5 })
    expect(descents).toHaveLength(1)
    expect(descents[0]).toMatchObject({ elevationM: -300, verticalSpeed: 900 })
    expect(movingSeconds(samples)).toBe(60 * 60)
  })

  it('does not split a climb on a short downhill dip', () => {
    const bumpy = track([
      { minutes: 15, km: 1.5, climbM: 150 },
      { minutes: 2, km: 0.3, climbM: -15 },
      { minutes: 15, km: 1.5, climbM: 150 },
    ])
    const { climbs } = detectClimbs(bumpy)
    expect(climbs).toHaveLength(1)
    // Net climb gain: 300 m up, 15 m lost along the way.
    expect(climbs[0]!.elevationM).toBe(285)
  })

  it('ignores bumps under 50 m', () => {
    expect(detectClimbs(track([{ minutes: 5, km: 1, climbM: 40 }, { minutes: 5, km: 1, climbM: -40 }])).climbs).toEqual([])
  })
})

describe('post-workout analysis', () => {
  const easy = aSession({ type: 'ENDURANCE', zone: 2, durationMin: 60 })

  it('approves an endurance session in the planned zone', () => {
    const activity = anActivity(track([{ minutes: 60, km: 10, hr: 140 }]), { plannedSessionId: easy.id })
    const analysis = analyzeWorkout(activity, { profile, session: easy, sessions: [easy], history: [] })
    expect(analysis.verdict).toBe('ON_TARGET')
    expect(analysis.score).toBe(100)
    expect(analysis.headline).toMatch(/^Séance réussie/)
    expect(analysis.insights.map((i) => i.title)).toContain('Intensité maîtrisée')
  })

  it('flags an easy session run too hard and suggests lightening tomorrow\'s key session', () => {
    const key = aSession({ id: 'key', date: '2027-03-04', type: 'UPHILL_THRESHOLD', zone: 4, keySession: true, status: 'PLANNED', title: 'Seuil en côte' })
    const activity = anActivity(track([{ minutes: 60, km: 12, hr: 165 }]))
    const analysis = analyzeWorkout(activity, { profile, session: easy, sessions: [easy, key], history: [] })
    expect(analysis.verdict).toBe('TOO_HARD')
    expect(analysis.score).toBe(70)
    expect(analysis.headline).toContain('au-dessus de Z2')
    expect(analysis.nextStep).toMatchObject({ sessionId: 'key', suggestLighten: true })
    expect(analysis.nextStep!.text).toContain('demain')
  })

  it('spots threshold blocks that are not intense enough', () => {
    const threshold = aSession({
      type: 'UPHILL_THRESHOLD',
      zone: 4,
      durationMin: 60,
      steps: [{ kind: 'EFFORT', label: 'Seuil en côte', durationMin: 8, repeat: 3, zone: 4 }],
    })
    const activity = anActivity(track([{ minutes: 55, km: 9, climbM: 200, hr: 150 }, { minutes: 5, km: 1, hr: 165 }]))
    const analysis = analyzeWorkout(activity, { profile, session: threshold, sessions: [threshold], history: [] })
    expect(analysis.verdict).toBe('TOO_EASY')
    expect(analysis.comparison).toMatchObject({ plannedEffortMin: 24, effortMin: 5 })
  })

  it('tells a cut-short session apart from an unplanned run', () => {
    const short = analyzeWorkout(anActivity(track([{ minutes: 40, km: 7, hr: 140 }])), { profile, session: easy, sessions: [], history: [] })
    expect(short.verdict).toBe('CUT_SHORT')
    const free = analyzeWorkout(anActivity(track([{ minutes: 40, km: 7, hr: 140 }])), { profile, sessions: [], history: [] })
    expect(free.verdict).toBe('UNPLANNED')
    expect(free.score).toBeUndefined()
    expect(free.headline).toBe('Sortie libre : 40 min, 7 km.')
  })

  it('compares the best VAM with the previous 8 weeks', () => {
    const climb = (vamMin: number) => track([{ minutes: vamMin, km: 2, climbM: 200, hr: 150 }, { minutes: 15, km: 2, climbM: -200, hr: 135 }])
    const history = [1, 2, 3].map((week) =>
      anActivity(climb(24), { id: `h${week}`, startTime: new Date(Date.parse('2027-03-03T07:00:00Z') - week * 7 * 86_400_000).toISOString() }),
    )
    const analysis = analyzeWorkout(anActivity(climb(20)), { profile, sessions: [], history })
    expect(analysis.vamBaseline).toBe(500)
    expect(analysis.bestClimb!.verticalSpeed).toBe(600)
    const insight = analysis.insights.find((i) => i.title === 'Montées')!
    expect(insight.tone).toBe('POSITIVE')
    expect(insight.text).toContain('20 % de mieux')
    // 20 min climb at 600 m/h vs 500 before: records over 5, 10 and 20 min, not 30 (the run does not climb that long).
    expect(analysis.vamRecords).toEqual([
      { minutes: 5, vam: 600, previous: 500 },
      { minutes: 10, vam: 600, previous: 500 },
      { minutes: 20, vam: 600, previous: 500 },
    ])
    expect(analysis.insights.map((i) => i.title)).toContain('Records de VAM')
  })

  it('detects cardiac drift on a long run', () => {
    const drift = anActivity(track([{ minutes: 60, km: 10, hr: 135 }, { minutes: 60, km: 10, hr: 150 }]))
    const analysis = analyzeWorkout(drift, { profile, sessions: [], history: [] })
    // Warm-up excluded: first half = 50 min at 135 + 5 min at 150 (136.4 bpm), second half at 150, same pace.
    expect(analysis.decouplingPct).toBeCloseTo(9.1, 1)
    expect(analysis.insights.map((i) => i.title)).toEqual(expect.arrayContaining(['Dérive cardiaque', 'Carburant']))
  })

  it('does not mistake a warm-up or a terrain change for drift', () => {
    const warmUp = anActivity(track([{ minutes: 8, km: 1.3, hr: 110 }, { minutes: 62, km: 10.3, hr: 140 }]))
    expect(analyzeWorkout(warmUp, { profile, sessions: [], history: [] }).decouplingPct).toBe(0)
    const hillyThenFlat = anActivity(track([{ minutes: 40, km: 6, climbM: 300, hr: 150 }, { minutes: 40, km: 7, climbM: -300, hr: 140 }]))
    expect(analyzeWorkout(hillyThenFlat, { profile, sessions: [], history: [] }).decouplingPct).toBeUndefined()
  })

  it('flags a quality session pushed well beyond the planned blocks', () => {
    const fartlek = aSession({
      type: 'FARTLEK',
      zone: 3,
      durationMin: 50,
      steps: [{ kind: 'EFFORT', label: 'Accélération', durationMin: 2, repeat: 4, zone: 3 }],
    })
    const analysis = analyzeWorkout(anActivity(track([{ minutes: 50, km: 9, hr: 160 }])), { profile, session: fartlek, sessions: [], history: [] })
    expect(analysis.verdict).toBe('TOO_HARD')
    expect(analysis.headline).toBe('Plus intense que prévu : 50 min en zone d’effort pour 8 prévues.')
    expect(analysis.insights[0]!.title).toBe('Séance trop appuyée')
  })

  it('compares actual load with a planned load on the same scale', () => {
    const activity = anActivity(track([{ minutes: 60, km: 10, hr: 141 }]))
    const analysis = analyzeWorkout(activity, { profile, session: easy, sessions: [], history: [] })
    // Target Z2 (65 % of reserve ≈ 141 bpm): actual load ≈ planned load.
    expect(analysis.load / analysis.plannedLoad!).toBeCloseTo(1, 1)
    expect(analysis.insights.map((i) => i.topic)).not.toContain('LOAD')
  })

  it('does not include a gentle approach slope in the climb', () => {
    const approach = track([{ minutes: 15, km: 2.4, climbM: 25 }, { minutes: 25, km: 2.5, climbM: 250 }])
    const [climb] = detectClimbs(approach).climbs
    expect(climb!.startKm).toBeGreaterThan(2.1)
    expect(climb!.verticalSpeed).toBeGreaterThan(560)
  })

  it('stays useful without a detailed track or max HR', () => {
    const analysis = analyzeWorkout(anActivity([], { samples: undefined, durationSec: 3600, distanceKm: 10 }), { profile: {}, session: easy, sessions: [], history: [] })
    expect(analysis.hasDetail).toBe(false)
    expect(analysis.verdict).toBe('ON_TARGET')
    expect(analysis.insights.at(-1)!.title).toBe('Analyse partielle')
  })
})
