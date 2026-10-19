import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_SETTINGS as settings,
  dueWeeklySummary,
  isMorningDue,
  localTime,
  morningMessage,
  validateNotificationSettings,
  weeklyMessage,
} from '../../src/domain/notifications/notification'
import { generatePlan } from '../../src/domain/plan/plan-generator'
import { addDays } from '../../src/domain/shared/dates'
import { buildWeeklySummary } from '../../src/domain/summary/weekly-summary'
import { aGoal, aProfile, routineSummaries } from '../fixtures/factories'
import { aSession, anActivity, track } from '../fixtures/tracks'

describe('heure locale', () => {
  it('suit le fuseau de l’utilisateur, heure d’été comprise', () => {
    expect(localTime(new Date('2027-01-15T06:00:00Z'), 'Europe/Paris')).toEqual({ date: '2027-01-15', minutes: 7 * 60 })
    expect(localTime(new Date('2027-07-15T05:00:00Z'), 'Europe/Paris')).toEqual({ date: '2027-07-15', minutes: 7 * 60 })
    expect(localTime(new Date('2027-07-15T23:30:00Z'), 'Europe/Paris')).toEqual({ date: '2027-07-16', minutes: 90 })
    expect(localTime(new Date('2027-07-15T12:00:00Z'), 'Indian/Reunion').minutes).toBe(16 * 60)
  })

  it('refuse une heure ou un fuseau invalides', () => {
    expect(() => validateNotificationSettings({ ...settings, morning: { enabled: true, time: '25:00' } })).toThrow()
    expect(() => validateNotificationSettings({ ...settings, timeZone: 'Mars/Olympus' })).toThrow()
    expect(() => validateNotificationSettings(settings)).not.toThrow()
  })
})

describe('rappel du matin', () => {
  const at = (date: string, hh: number, mm = 0) => ({ date, minutes: hh * 60 + mm })

  it('part une seule fois, à l’heure choisie, et se rattrape dans les 4 h', () => {
    expect(isMorningDue(settings, {}, at('2027-03-03', 6, 59))).toBe(false)
    expect(isMorningDue(settings, {}, at('2027-03-03', 7))).toBe(true)
    expect(isMorningDue(settings, {}, at('2027-03-03', 10, 30))).toBe(true)
    expect(isMorningDue(settings, {}, at('2027-03-03', 11, 5))).toBe(false)
    expect(isMorningDue(settings, { lastMorning: '2027-03-03' }, at('2027-03-03', 8))).toBe(false)
    expect(isMorningDue({ ...settings, morning: { enabled: false, time: '07:00' } }, {}, at('2027-03-03', 8))).toBe(false)
  })

  it('décrit la séance du jour et rappelle le bilan du matin', () => {
    const sessions = [
      aSession({ id: 'a', date: '2027-03-03', status: 'PLANNED', title: 'Sortie longue', durationMin: 150, distanceKm: 22, elevationGainM: 900, keySession: true, objective: 'Habituer le corps à la durée.' }),
      aSession({ id: 'b', date: '2027-03-04', status: 'PLANNED' }),
    ]
    const message = morningMessage(sessions, { date: '2027-03-03', checkInDone: false })!
    expect(message.title).toBe('Séance clé aujourd’hui')
    expect(message.body).toBe('🏃 Sortie longue · 2 h 30, 22 km, 900 m D+\nHabituer le corps à la durée.\nFais ton bilan du matin : Kairn ajuste la séance si besoin.')
    expect(message.url).toBe('/seance/a')
  })

  it('se tait les jours sans séance ou quand la séance est déjà faite', () => {
    expect(morningMessage([aSession({ date: '2027-03-03', status: 'DONE' })], { date: '2027-03-03', checkInDone: true })).toBeUndefined()
    expect(morningMessage([], { date: '2027-03-03', checkInDone: true })).toBeUndefined()
  })

  it('souhaite une bonne course le jour J', () => {
    const race = aSession({ type: 'COURSE', title: 'CCC', date: '2027-08-27', status: 'PLANNED' })
    expect(morningMessage([race], { date: '2027-08-27', checkInDone: true })!.title).toBe('Jour de course 🏔️')
  })
})

describe('bilan hebdomadaire', () => {
  it('part le dimanche soir, ou le lundi matin s’il a été manqué', () => {
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

  it('compare la semaine au plan, met en avant les points clés et annonce la suivante', () => {
    // Les séances faciles sont faites comme prévu, en endurance ; les séances clés sont oubliées.
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
    // Compte tout neuf : pas d'avis sur la fatigue, le modèle part de zéro.
    expect(summary.form.reliable).toBe(false)
    expect(summary.insights.map((i) => i.title)).not.toEqual(expect.arrayContaining(['Fatigue élevée']))
    expect(summary.insights.map((i) => i.title)).not.toEqual(expect.arrayContaining(['Forme en hausse']))

    const message = weeklyMessage(summary)
    expect(message.title).toBe('Bilan de la semaine 1')
    expect(message.url).toBe(`/bilan/${week.startDate}`)
    expect(message.body.split('\n').at(-1)).toMatch(/^Semaine prochaine : foncier/)
  })

  it('signale deux semaines de suite bien en dessous du volume prévu', () => {
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
