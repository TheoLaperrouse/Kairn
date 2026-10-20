import { describe, expect, it } from 'vitest'
import { isGenericName, suggestActivityName } from '../../src/domain/activity/activity-name'
import { analyzeWorkout } from '../../src/domain/analysis/workout-analysis'
import {
  DEFAULT_NOTIFICATION_SETTINGS as settings,
  checkInReminderMessage,
  isCheckInReminderDue,
  morningMessage,
  normalizeSettings,
} from '../../src/domain/notifications/notification'
import { generatePlan } from '../../src/domain/plan/plan-generator'
import { sessionPurpose } from '../../src/domain/plan/session-purpose'
import { personalTrainingSpeed } from '../../src/domain/plan/training-speed'
import { activityLoad, computeLoadSeries, usesHeartRateLoad } from '../../src/domain/training-load/training-load'
import { aGoal, aProfile, routineSummaries } from '../fixtures/factories'
import { aSession, anActivity, track } from '../fixtures/tracks'

const profile = { hrMax: 190, hrRest: 50 }

describe('training load scale', () => {
  it('projects planned load on the heart-rate scale when the runner records heart rate', () => {
    const easyRun = anActivity(track([{ minutes: 60, km: 10, hr: 141 }]), { startTime: '2027-03-01T07:00:00.000Z' })
    expect(usesHeartRateLoad(profile, [easyRun])).toBe(true)
    expect(usesHeartRateLoad(profile, [{ ...easyRun, avgHeartRate: undefined }])).toBe(false)
    expect(usesHeartRateLoad({}, [easyRun])).toBe(false)

    // The same 60-min Z2 run, done (past) and planned (future), must weigh the same in the series.
    const planned = aSession({ date: '2027-03-03', status: 'PLANNED', durationMin: 60, zone: 2 })
    const series = computeLoadSeries([easyRun], [planned], profile, '2027-03-01', '2027-03-03', '2027-03-02')
    const done = series.find((p) => p.date === '2027-03-01')!.load
    const projected = series.find((p) => p.date === '2027-03-03')!.load
    expect(done).toBe(activityLoad(easyRun, profile))
    expect(projected / done).toBeGreaterThan(0.9)
    expect(projected / done).toBeLessThan(1.1)
  })
})

describe('activity names', () => {
  it('recognises default names from watches, Strava and our parsers', () => {
    for (const name of ['Morning Run', 'Lunch Trail Run', 'Course à pied le matin', 'Course à pied dans l’après-midi', 'Sortie trail', 'Trail', 'Vélo'])
      expect(isGenericName(name)).toBe(true)
    for (const name of ['Tour du Mont Aiguille', 'Footing du matin', 'Fartlek nature']) expect(isGenericName(name)).toBe(false)
  })

  it('names an activity after its session, or from its profile', () => {
    const run = { sport: 'RUN' as const, durationSec: 3600, distanceKm: 10.4, elevationGainM: 380 }
    expect(suggestActivityName(run, aSession({ title: 'Seuil en côte' }))).toBe('Seuil en côte')
    expect(suggestActivityName(run)).toBe('Sortie vallonnée · 10 km')
    expect(suggestActivityName({ ...run, elevationGainM: 600 })).toBe('Sortie en montagne · 10 km')
    expect(suggestActivityName({ ...run, elevationGainM: 40, distanceKm: 8.25 })).toBe('Footing · 8,3 km')
    expect(suggestActivityName({ ...run, durationSec: 3 * 3600, distanceKm: 23, elevationGainM: 888 })).toBe('Sortie longue vallonnée · 23 km')
    expect(suggestActivityName({ sport: 'BIKE', durationSec: 5400, distanceKm: 42, elevationGainM: 300 })).toBe('Vélo · 42 km')
  })
})

describe('max heart rate detection', () => {
  it('suggests raising the profile max HR when a run holds a higher one for 10 s', () => {
    const hard = anActivity(track([{ minutes: 30, km: 6, hr: 170 }, { minutes: 1, km: 0.3, hr: 196 }]))
    const analysis = analyzeWorkout(hard, { profile, sessions: [], history: [] })
    expect(analysis.hrMaxSuggestion).toEqual({ observed: 196, current: 190 })
    expect(analysis.insights.map((i) => i.title)).toContain('FC max dépassée')
  })

  it('ignores an isolated sensor spike reported only in the summary', () => {
    const spike = anActivity([], { samples: undefined, durationSec: 3600, distanceKm: 10, avgHeartRate: 150, maxHeartRate: 192 })
    expect(analyzeWorkout(spike, { profile, sessions: [], history: [] }).hrMaxSuggestion).toBeUndefined()
  })

  it('offers the highest observed heart rate when the profile has none', () => {
    const past = anActivity(track([{ minutes: 20, km: 4, hr: 186 }]), { id: 'past' })
    const today = anActivity(track([{ minutes: 20, km: 4, hr: 150 }]))
    const analysis = analyzeWorkout(today, { profile: {}, sessions: [], history: [past] })
    expect(analysis.hrMaxSuggestion).toEqual({ observed: 186 })
    expect(analysis.insights.at(-1)!.text).toContain('186 bpm')
  })
})

describe('personal training speed', () => {
  it('uses the median km-effort speed of recent runs, and needs at least three', () => {
    const run = (day: string, km: number, gain: number) =>
      anActivity([], { samples: undefined, startTime: `${day}T07:00:00.000Z`, durationSec: 3600, distanceKm: km, elevationGainM: gain })
    const runs = [run('2027-02-20', 9, 100), run('2027-02-25', 8, 300), run('2027-03-01', 10, 0)]
    expect(personalTrainingSpeed(runs.slice(0, 2), '2027-03-03')).toBeUndefined()
    // km-effort/h: 10, 11, 10 → median 10.
    expect(personalTrainingSpeed(runs, '2027-03-03')).toBe(10)
    // Runs older than 6 weeks are ignored.
    expect(personalTrainingSpeed(runs, '2027-05-01')).toBeUndefined()
  })

  it('makes planned distances follow the measured speed', () => {
    const request = { planId: 'p', goal: aGoal(), profile: aProfile(), today: '2027-03-01', createdAt: '2027-03-01T00:00:00Z', routines: routineSummaries }
    const typical = generatePlan(request).sessions.find((s) => s.type === 'ENDURANCE')!
    const fast = generatePlan({ ...request, trainingSpeedKme: 12 }).sessions.find((s) => s.type === 'ENDURANCE')!
    // Distance per minute scales with speed (durations differ too: the same weekly km takes less time at 12 km-effort/h).
    const pace = (s: typeof typical) => s.distanceKm! / s.durationMin
    expect(pace(fast) / pace(typical)).toBeCloseTo(12 / 8, 1)
  })
})

describe('session purpose', () => {
  const goal = aGoal({ nightSections: true, polesAllowed: true })
  const plan = generatePlan({ planId: 'p', goal, profile: aProfile(), today: '2027-03-01', createdAt: '2027-03-01T00:00:00Z', routines: routineSummaries })

  it('explains each session in light of the phase and the race', () => {
    for (const session of plan.sessions) expect(sessionPurpose(session, plan, goal, aProfile()).length).toBeGreaterThan(30)
    const longRun = plan.sessions.find((s) => s.type === 'LONG_RUN' && plan.weeks[s.weekIndex]!.phase === 'SPECIFIC')!
    expect(sessionPurpose(longRun, plan, goal, aProfile())).toContain('frontale')
    const hike = plan.sessions.find((s) => s.type === 'HIKE_RUN')
    if (hike) expect(sessionPurpose(hike, plan, goal, aProfile())).toContain('avec bâtons')
    const race = plan.sessions.find((s) => s.type === 'RACE')!
    expect(sessionPurpose(race, plan, goal, aProfile())).toBe('CCC, c’est aujourd’hui : tout le travail est fait, fais-toi confiance.')
  })
})

describe('readiness-aware reminders', () => {
  const today = '2027-03-03'
  const sessions = [aSession({ id: 's', date: today, status: 'PLANNED', title: 'Footing', durationMin: 60 })]

  it('suggests adapting the session when this morning’s check-in advises it', () => {
    const message = morningMessage(sessions, { date: today, latest: { date: today, level: 'ORANGE', action: 'LIGHTEN' } })!
    expect(message.title).toBe('Séance du jour, à adapter')
    expect(message.body).toContain('conseille d’alléger')
  })

  it('asks for a check-in when yesterday was orange or red', () => {
    const message = morningMessage(sessions, { date: today, latest: { date: '2027-03-02', level: 'RED', action: 'REST' } })!
    expect(message.body).toContain('Ta forme était au rouge hier')
    const green = morningMessage(sessions, { date: today, latest: { date: '2027-03-02', level: 'GREEN', action: 'NONE' } })!
    expect(green.body).toContain('Fais ton bilan du matin')
    const checked = morningMessage(sessions, { date: today, latest: { date: today, level: 'GREEN', action: 'NONE' } })!
    expect(checked.body).not.toContain('bilan')
  })

  it('reminds to fill in the check-in only when enabled, once, on session days', () => {
    const enabled = { ...settings, checkIn: { enabled: true, time: '09:00' } }
    expect(isCheckInReminderDue(settings, {}, { date: today, minutes: 9 * 60 })).toBe(false)
    expect(isCheckInReminderDue(enabled, {}, { date: today, minutes: 8 * 60 + 59 })).toBe(false)
    expect(isCheckInReminderDue(enabled, {}, { date: today, minutes: 9 * 60 })).toBe(true)
    expect(isCheckInReminderDue(enabled, { lastCheckInReminder: today }, { date: today, minutes: 10 * 60 })).toBe(false)
    expect(checkInReminderMessage(sessions, today)?.tag).toBe('check-in')
    expect(checkInReminderMessage(sessions, '2027-03-04')).toBeUndefined()
  })

  it('completes settings saved before the check-in reminder existed', () => {
    const { checkIn: _checkIn, ...old } = settings
    expect(normalizeSettings(old).checkIn).toEqual({ enabled: false, time: '09:00' })
  })
})
