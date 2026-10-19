import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_SETTINGS as settings,
  dueWeeklySummary,
  isMorningDue,
  morningMessage,
  validateNotificationSettings,
  weeklyMessage,
} from '../../src/domain/notifications/notification'
import { localTime } from '../../src/domain/shared/dates'
import { generatePlan } from '../../src/domain/plan/plan-generator'
import { addDays } from '../../src/domain/shared/dates'
import { buildWeeklySummary } from '../../src/domain/summary/weekly-summary'
import { aGoal, aProfile, routineSummaries } from '../fixtures/factories'
import { aSession, anActivity, track } from '../fixtures/tracks'

describe('local time', () => {
  it('follows the user time zone, including daylight saving time', () => {
    expect(localTime(new Date('2027-01-15T06:00:00Z'), 'Europe/Paris')).toEqual({ date: '2027-01-15', minutes: 7 * 60 })
    expect(localTime(new Date('2027-07-15T05:00:00Z'), 'Europe/Paris')).toEqual({ date: '2027-07-15', minutes: 7 * 60 })
    expect(localTime(new Date('2027-07-15T23:30:00Z'), 'Europe/Paris')).toEqual({ date: '2027-07-16', minutes: 90 })
    expect(localTime(new Date('2027-07-15T12:00:00Z'), 'Indian/Reunion').minutes).toBe(16 * 60)
  })

  it('rejects an invalid time or time zone', () => {
    expect(() => validateNotificationSettings({ ...settings, morning: { enabled: true, time: '25:00' } })).toThrow()
    expect(() => validateNotificationSettings({ ...settings, timeZone: 'Mars/Olympus' })).toThrow()
    expect(() => validateNotificationSettings(settings)).not.toThrow()
  })
})

describe('morning reminder', () => {
  const at = (date: string, hh: number, mm = 0) => ({ date, minutes: hh * 60 + mm })

  it('fires once, at the chosen time, and catches up within 4 h', () => {
    expect(isMorningDue(settings, {}, at('2027-03-03', 6, 59))).toBe(false)
    expect(isMorningDue(settings, {}, at('2027-03-03', 7))).toBe(true)
    expect(isMorningDue(settings, {}, at('2027-03-03', 10, 30))).toBe(true)
    expect(isMorningDue(settings, {}, at('2027-03-03', 11, 5))).toBe(false)
    expect(isMorningDue(settings, { lastMorning: '2027-03-03' }, at('2027-03-03', 8))).toBe(false)
    expect(isMorningDue({ ...settings, morning: { enabled: false, time: '07:00' } }, {}, at('2027-03-03', 8))).toBe(false)
  })

  it('describes the session of the day and reminds about the morning check-in', () => {
    const sessions = [
      aSession({ id: 'a', date: '2027-03-03', status: 'PLANNED', title: 'Sortie longue', durationMin: 150, distanceKm: 22, elevationGainM: 900, keySession: true, objective: 'Habituer le corps à la durée.' }),
      aSession({ id: 'b', date: '2027-03-04', status: 'PLANNED' }),
    ]
    const message = morningMessage(sessions, { date: '2027-03-03' })!
    expect(message.title).toBe('Séance clé aujourd’hui')
    expect(message.body).toBe('🏃 Sortie longue · 2 h 30, 22 km, 900 m D+\nHabituer le corps à la durée.\nFais ton bilan du matin : Kairn ajuste la séance si besoin.')
    expect(message.url).toBe('/seance/a')
  })

  it('stays silent on rest days or when the session is already done', () => {
    expect(morningMessage([aSession({ date: '2027-03-03', status: 'DONE' })], { date: '2027-03-03' })).toBeUndefined()
    expect(morningMessage([], { date: '2027-03-03' })).toBeUndefined()
  })

  it('wishes a good race on race day', () => {
    const race = aSession({ type: 'COURSE', title: 'CCC', date: '2027-08-27', status: 'PLANNED' })
    expect(morningMessage([race], { date: '2027-08-27' })!.title).toBe('Jour de course 🏔️')
  })
})

describe('weekly summary', () => {
  it('is sent on Sunday evening, or Monday morning if missed', () => {
    const sunday = { date: '2027-03-07', minutes: 19 * 60 }
    expect(dueWeeklySummary(settings, {}, sunday)).toBe('2027-03-01')
    expect(dueWeeklySummary(settings, {}, { ...sunday, minutes: 18 * 60 })).toBeUndefined()
    expect(dueWeeklySummary(settings, {}, { date: '2027-03-08', minutes: 8 * 60 })).toBe('2027-03-01')
    expect(dueWeeklySummary(settings, {}, { date: '2027-03-08', minutes: 13 * 60 })).toBeUndefined()
    expect(dueWeeklySummary(settings, { lastWeekly: '2027-03-01' }, sunday)).toBeUndefined()
  })

  const profile = aProfile()
  const goal = aGoal({ raceDate: '2027-08-27' })
  const plan = generatePlan({ planId: 'p', goal, profile, today: '2027-03-01', createdAt: '2027-03-01T00:00:00Z', routines: routineSummaries })
  const week = plan.weeks[0]!
  const weekSessions = plan.sessions.filter((s) => s.weekIndex === 0)

  it('compares the week with the plan, highlights key points and previews the next week', () => {
    // Easy sessions are done as planned, in endurance; key sessions are skipped.
    const keys = weekSessions.filter((s) => s.keySession)
    const done = weekSessions.filter((s) => s.sport !== 'STRENGTH' && s.zone <= 2 && !s.keySession)
    const activities = done.map((s, i) =>
      anActivity(track([{ minutes: s.durationMin / 2, km: 4, climbM: 150, hr: 140 }, { minutes: s.durationMin / 2, km: 4, climbM: -150, hr: 138 }]), {
        id: `a${i}`,
        startTime: `${s.date}T07:00:00.000Z`,
        sport: s.sport,
        plannedSessionId: s.id,
      }),
    )
    const sessions = plan.sessions.map((s) => (done.includes(s) ? { ...s, status: 'DONE' as const, activityId: `a${done.indexOf(s)}` } : s))
    const summary = buildWeeklySummary({
      weekStart: week.startDate,
      today: addDays(week.startDate, 7),
      profile,
      goal,
      plan: { ...plan, sessions },
      activities,
      checkIns: [],
    })

    expect(summary.inProgress).toBe(false)
    expect(summary.totals.activities).toBe(done.length)
    expect(summary.sessions.done).toBe(done.length)
    expect(summary.verdicts.CONFORME).toBe(done.length)
    expect(summary.zones![2]).toBeGreaterThan(0)
    expect(summary.highlights.map((h) => h.label)).toEqual(['Plus longue sortie', 'Plus grosse montée', 'Meilleure VAM'])
    expect(summary.nextWeek?.index).toBe(1)
    expect(summary.headline).toMatch(/^Semaine 1 · Foncier : /)
    expect(keys.length).toBeGreaterThan(0)
    expect(summary.keySessions.map((k) => k.status)).toEqual(keys.map(() => 'PLANNED'))
    expect(summary.insights.map((i) => i.title)).toContain(keys.length > 1 ? 'Séances clés manquées' : 'Séance clé manquée')
    expect(summary.insights.map((i) => i.title)).toContain('Bonne répartition')
    // Brand-new account: no fatigue verdict, the model starts from zero.
    expect(summary.form.reliable).toBe(false)
    expect(summary.insights.map((i) => i.title)).not.toEqual(expect.arrayContaining(['Fatigue élevée']))
    expect(summary.insights.map((i) => i.title)).not.toEqual(expect.arrayContaining(['Forme en hausse']))

    const message = weeklyMessage(summary)
    expect(message.title).toBe('Bilan de la semaine 1')
    expect(message.url).toBe(`/bilan/${week.startDate}`)
    expect(message.body.split('\n').at(-1)).toMatch(/^Semaine prochaine : foncier/)
  })

  it('flags two weeks in a row well below the planned volume', () => {
    const second = plan.weeks[1]!
    const tiny = (date: string, id: string) => anActivity(track([{ minutes: 20, km: 3, hr: 140 }]), { id, startTime: `${date}T07:00:00.000Z` })
    const summary = buildWeeklySummary({
      weekStart: second.startDate,
      today: addDays(second.startDate, 7),
      profile,
      goal,
      plan,
      activities: [tiny(week.startDate, 'w1'), tiny(second.startDate, 'w2')],
      checkIns: [],
    })
    expect(summary.insights.map((i) => i.title)).toEqual(expect.arrayContaining(['Volume en retrait', 'Plan trop ambitieux ?']))
  })
})
