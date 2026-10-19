import { describe, expect, it } from 'vitest'
import { resampleTrack } from '../../src/domain/activity/activity'
import { detectClimbs, movingSeconds } from '../../src/domain/analysis/climbs'
import { heartRateZones, timeInZones, zoneOf } from '../../src/domain/analysis/heart-rate-zones'
import { analyzeWorkout } from '../../src/domain/analysis/workout-analysis'
import { aSession, anActivity, track } from '../fixtures/tracks'

// FC repos 50, max 190 : zones de Karvonen Z2 ≥ 134, Z3 ≥ 148, Z4 ≥ 162, Z5 ≥ 176.
const profile = { hrMax: 190, hrRest: 50 }

describe('trace détaillée', () => {
  it('rééchantillonne à 10 s en moyennant la FC et l’altitude', () => {
    const raw = Array.from({ length: 61 }, (_, i) => ({ t: 1000 + i, d: i / 1000, alt: 100 + i, hr: i % 2 ? 150 : 140 }))
    const samples = resampleTrack(raw)
    expect(samples).toHaveLength(7)
    expect(samples[0]).toEqual({ t: 10, d: 0.009, alt: 104.5, hr: 145 })
    expect(samples.at(-1)!.d).toBe(0.06)
  })

  it('limite la taille de la trace d’un ultra', () => {
    const raw = Array.from({ length: 20 * 3600 }, (_, i) => ({ t: i, d: i / 400, alt: 1000, hr: 130 }))
    expect(resampleTrack(raw).length).toBeLessThanOrEqual(1201)
  })

  it('ignore les FC aberrantes', () => {
    const samples = resampleTrack([
      { t: 0, d: 0, hr: 255 },
      { t: 5, d: 0.01, hr: 20 },
      { t: 12, d: 0.02, hr: 140 },
    ])
    expect(samples[0]!.hr).toBeUndefined()
    expect(samples[1]!.hr).toBe(140)
  })
})

describe('zones cardiaques', () => {
  it('utilise la FC de réserve quand la FC de repos est connue, sinon le % de FC max', () => {
    expect(heartRateZones(profile)).toEqual({ method: 'RESERVE', bounds: [134, 148, 162, 176] })
    expect(heartRateZones({ hrMax: 200 })).toEqual({ method: 'MAX', bounds: [120, 140, 160, 180] })
    expect(heartRateZones({})).toBeUndefined()
    expect(zoneOf(133, heartRateZones(profile)!)).toBe(1)
    expect(zoneOf(170, heartRateZones(profile)!)).toBe(4)
  })

  it('compte le temps par zone sans les pauses de la montre', () => {
    const samples = [...track([{ minutes: 10, km: 2, hr: 140 }]), { t: 1200, d: 2, hr: 170 }, { t: 1210, d: 2.03, hr: 170 }]
    const time = timeInZones(samples, heartRateZones(profile)!)
    expect(time[2]).toBe(600)
    expect(time[4]).toBe(10)
  })
})

describe('montées et descentes', () => {
  const samples = track([
    { minutes: 10, km: 2, hr: 140 },
    { minutes: 30, km: 3, climbM: 300, hr: 155 },
    { minutes: 5 },
    { minutes: 20, km: 3, climbM: -300, hr: 140 },
  ])

  it('mesure la VAM sans compter la pause au sommet', () => {
    const { climbs, descents } = detectClimbs(samples)
    expect(climbs).toHaveLength(1)
    expect(climbs[0]).toMatchObject({ elevationM: 300, durationSec: 1800, verticalSpeed: 600, gradePct: 10, startKm: 2, endKm: 5 })
    expect(descents).toHaveLength(1)
    expect(descents[0]).toMatchObject({ elevationM: -300, verticalSpeed: 900 })
    expect(movingSeconds(samples)).toBe(60 * 60)
  })

  it('ne coupe pas une montée pour un petit replat descendant', () => {
    const bumpy = track([
      { minutes: 15, km: 1.5, climbM: 150 },
      { minutes: 2, km: 0.3, climbM: -15 },
      { minutes: 15, km: 1.5, climbM: 150 },
    ])
    const { climbs } = detectClimbs(bumpy)
    expect(climbs).toHaveLength(1)
    // Dénivelé net de la montée : 300 m gravis, 15 m redescendus en chemin.
    expect(climbs[0]!.elevationM).toBe(285)
  })

  it('ignore les bosses de moins de 50 m', () => {
    expect(detectClimbs(track([{ minutes: 5, km: 1, climbM: 40 }, { minutes: 5, km: 1, climbM: -40 }])).climbs).toEqual([])
  })
})

describe('analyse après la séance', () => {
  const easy = aSession({ type: 'ENDURANCE', zone: 2, durationMin: 60 })

  it('valide une séance d’endurance dans la zone prévue', () => {
    const activity = anActivity(track([{ minutes: 60, km: 10, hr: 140 }]), { plannedSessionId: easy.id })
    const analysis = analyzeWorkout(activity, { profile, session: easy, sessions: [easy], history: [] })
    expect(analysis.verdict).toBe('CONFORME')
    expect(analysis.score).toBe(100)
    expect(analysis.headline).toMatch(/^Séance réussie/)
    expect(analysis.insights.map((i) => i.title)).toContain('Intensité maîtrisée')
  })

  it('signale une séance facile courue trop vite et conseille d’alléger la séance clé du lendemain', () => {
    const key = aSession({ id: 'key', date: '2027-03-04', type: 'SEUIL_MONTEE', zone: 4, keySession: true, status: 'PLANNED', title: 'Seuil en côte' })
    const activity = anActivity(track([{ minutes: 60, km: 12, hr: 165 }]))
    const analysis = analyzeWorkout(activity, { profile, session: easy, sessions: [easy, key], history: [] })
    expect(analysis.verdict).toBe('TROP_INTENSE')
    expect(analysis.score).toBe(70)
    expect(analysis.headline).toContain('au-dessus de Z2')
    expect(analysis.nextStep).toMatchObject({ sessionId: 'key', suggestLighten: true })
    expect(analysis.nextStep!.text).toContain('demain')
  })

  it('repère des blocs de seuil pas assez intenses', () => {
    const threshold = aSession({
      type: 'SEUIL_MONTEE',
      zone: 4,
      durationMin: 60,
      steps: [{ kind: 'EFFORT', label: 'Seuil en côte', durationMin: 8, repeat: 3, zone: 4 }],
    })
    const activity = anActivity(track([{ minutes: 55, km: 9, climbM: 200, hr: 150 }, { minutes: 5, km: 1, hr: 165 }]))
    const analysis = analyzeWorkout(activity, { profile, session: threshold, sessions: [threshold], history: [] })
    expect(analysis.verdict).toBe('PAS_ASSEZ_INTENSE')
    expect(analysis.comparison).toMatchObject({ plannedEffortMin: 24, effortMin: 5 })
  })

  it('distingue une séance écourtée et une sortie libre', () => {
    const short = analyzeWorkout(anActivity(track([{ minutes: 40, km: 7, hr: 140 }])), { profile, session: easy, sessions: [], history: [] })
    expect(short.verdict).toBe('ECOURTEE')
    const free = analyzeWorkout(anActivity(track([{ minutes: 40, km: 7, hr: 140 }])), { profile, sessions: [], history: [] })
    expect(free.verdict).toBe('HORS_PLAN')
    expect(free.score).toBeUndefined()
    expect(free.headline).toBe('Sortie libre : 40 min, 7 km.')
  })

  it('situe la meilleure VAM par rapport aux 8 semaines précédentes', () => {
    const climb = (vamMin: number) => track([{ minutes: vamMin, km: 2, climbM: 200, hr: 150 }, { minutes: 15, km: 2, climbM: -200, hr: 135 }])
    const history = [1, 2, 3].map((week) =>
      anActivity(climb(24), { id: `h${week}`, startTime: new Date(Date.parse('2027-03-03T07:00:00Z') - week * 7 * 86_400_000).toISOString() }),
    )
    const analysis = analyzeWorkout(anActivity(climb(20)), { profile, sessions: [], history })
    expect(analysis.vamBaseline).toBe(500)
    expect(analysis.bestClimb!.verticalSpeed).toBe(600)
    const insight = analysis.insights.find((i) => i.topic === 'MONTEE')!
    expect(insight.tone).toBe('POSITIVE')
    expect(insight.text).toContain('20 % de mieux')
  })

  it('détecte la dérive cardiaque sur une sortie longue', () => {
    const drift = anActivity(track([{ minutes: 60, km: 10, hr: 135 }, { minutes: 60, km: 10, hr: 150 }]))
    const analysis = analyzeWorkout(drift, { profile, sessions: [], history: [] })
    // Échauffement exclu : 1re moitié = 50 min à 135 + 5 min à 150 (136,4 bpm), 2e moitié à 150, même allure.
    expect(analysis.decouplingPct).toBeCloseTo(9.1, 1)
    expect(analysis.insights.map((i) => i.title)).toEqual(expect.arrayContaining(['Dérive cardiaque', 'Carburant']))
  })

  it('ne confond pas l’échauffement ou un changement de terrain avec une dérive', () => {
    const warmUp = anActivity(track([{ minutes: 8, km: 1.3, hr: 110 }, { minutes: 62, km: 10.3, hr: 140 }]))
    expect(analyzeWorkout(warmUp, { profile, sessions: [], history: [] }).decouplingPct).toBe(0)
    const hillyThenFlat = anActivity(track([{ minutes: 40, km: 6, climbM: 300, hr: 150 }, { minutes: 40, km: 7, climbM: -300, hr: 140 }]))
    expect(analyzeWorkout(hillyThenFlat, { profile, sessions: [], history: [] }).decouplingPct).toBeUndefined()
  })

  it('signale une séance de qualité appuyée bien au-delà des blocs prévus', () => {
    const fartlek = aSession({
      type: 'FARTLEK',
      zone: 3,
      durationMin: 50,
      steps: [{ kind: 'EFFORT', label: 'Accélération', durationMin: 2, repeat: 4, zone: 3 }],
    })
    const analysis = analyzeWorkout(anActivity(track([{ minutes: 50, km: 9, hr: 160 }])), { profile, session: fartlek, sessions: [], history: [] })
    expect(analysis.verdict).toBe('TROP_INTENSE')
    expect(analysis.headline).toBe('Plus intense que prévu : 50 min en zone d’effort pour 8 prévues.')
    expect(analysis.insights[0]!.title).toBe('Séance trop appuyée')
  })

  it('compare la charge réalisée à une charge prévue de même échelle', () => {
    const activity = anActivity(track([{ minutes: 60, km: 10, hr: 141 }]))
    const analysis = analyzeWorkout(activity, { profile, session: easy, sessions: [], history: [] })
    // Z2 visée (65 % de réserve ≈ 141 bpm) : charge réalisée ≈ charge prévue.
    expect(analysis.load / analysis.plannedLoad!).toBeCloseTo(1, 1)
    expect(analysis.insights.map((i) => i.topic)).not.toContain('CHARGE')
  })

  it('n’inclut pas un faux plat d’approche dans la montée', () => {
    const approach = track([{ minutes: 15, km: 2.4, climbM: 25 }, { minutes: 25, km: 2.5, climbM: 250 }])
    const [climb] = detectClimbs(approach).climbs
    expect(climb!.startKm).toBeGreaterThan(2.1)
    expect(climb!.verticalSpeed).toBeGreaterThan(560)
  })

  it('reste utile sans trace détaillée ni FC max', () => {
    const analysis = analyzeWorkout(anActivity([], { samples: undefined, durationSec: 3600, distanceKm: 10 }), { profile: {}, session: easy, sessions: [], history: [] })
    expect(analysis.hasDetail).toBe(false)
    expect(analysis.verdict).toBe('CONFORME')
    expect(analysis.insights.at(-1)!.title).toBe('Analyse partielle')
  })
})
