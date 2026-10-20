import type { WorkoutAnalysis } from '../analysis/workout-analysis'
import type { Readiness } from '../wellness/check-in'
import type { PlannedSession } from '../plan/training-plan'
import { addDays, DEFAULT_TIME_ZONE, weekday, type IsoDate, type LocalTime } from '../shared/dates'
import { assertDomain } from '../shared/errors'
import { formatInt, formatKm, formatMinutes } from '../shared/format'
import type { WeeklySummary } from '../summary/weekly-summary'

/** Message displayed by the phone; `url` is opened on tap. */
export interface PushMessage {
  title: string
  body: string
  url: string
  /** Replaces a previous notification with the same tag instead of stacking. */
  tag: string
}

export interface NotificationSettings {
  /** The user's IANA time zone, e.g. "Europe/Paris". */
  timeZone: string
  morning: { enabled: boolean; time: string }
  weekly: { enabled: boolean; time: string }
  analysis: { enabled: boolean }
  /** Morning check-in reminder, if it is not filled in by the set time on a session day. */
  checkIn: { enabled: boolean; time: string }
}

/** Last notifications sent: avoids duplicates, including after a restart. */
export interface NotificationState {
  lastMorning?: IsoDate
  lastWeekly?: IsoDate
  lastCheckInReminder?: IsoDate
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  timeZone: DEFAULT_TIME_ZONE,
  morning: { enabled: true, time: '07:00' },
  weekly: { enabled: true, time: '19:00' },
  analysis: { enabled: true },
  checkIn: { enabled: false, time: '09:00' },
}

/** Settings saved before an option was added: filled in with the default values. */
export function normalizeSettings(settings: Partial<NotificationSettings>): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...settings }
}

/** After a restart, a missed reminder is still sent within this delay. */
const CATCH_UP_MIN = 4 * 60
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateNotificationSettings(settings: NotificationSettings): void {
  assertDomain(TIME_PATTERN.test(settings.morning.time), 'Heure du rappel du matin invalide')
  assertDomain(TIME_PATTERN.test(settings.weekly.time), 'Heure du bilan hebdomadaire invalide')
  assertDomain(TIME_PATTERN.test(settings.checkIn.time), 'Heure du rappel du bilan du matin invalide')
  assertDomain(isValidTimeZone(settings.timeZone), 'Fuseau horaire inconnu')
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone })
    return true
  } catch {
    return false
  }
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h! * 60 + m!
}

/** Daily reminder enabled, not yet sent today, and time reached less than `CATCH_UP_MIN` ago. */
function isDailyReminderDue(reminder: { enabled: boolean; time: string }, lastSent: IsoDate | undefined, now: LocalTime): boolean {
  if (!reminder.enabled || lastSent === now.date) return false
  const at = minutesOf(reminder.time)
  return now.minutes >= at && now.minutes < at + CATCH_UP_MIN
}

export function isMorningDue(settings: NotificationSettings, state: NotificationState, now: LocalTime): boolean {
  return isDailyReminderDue(settings.morning, state.lastMorning, now)
}

/** The summary is sent on Sunday at the chosen time, or Monday morning if it was missed. */
export function dueWeeklySummary(settings: NotificationSettings, state: NotificationState, now: LocalTime): IsoDate | undefined {
  if (!settings.weekly.enabled) return undefined
  const day = weekday(now.date)
  const sunday = day === 6 && now.minutes >= minutesOf(settings.weekly.time)
  const mondayCatchUp = day === 0 && now.minutes < 12 * 60
  if (!sunday && !mondayCatchUp) return undefined
  const weekStart = addDays(now.date, sunday ? -6 : -7)
  return state.lastWeekly === weekStart ? undefined : weekStart
}

export function isCheckInReminderDue(settings: NotificationSettings, state: NotificationState, now: LocalTime): boolean {
  return isDailyReminderDue(settings.checkIn, state.lastCheckInReminder, now)
}

const SPORT_EMOJI = { RUN: '🏃', BIKE: '🚴', STRENGTH: '💪' } as const

function describeSession(session: PlannedSession): string {
  const details = [formatMinutes(session.durationMin)]
  if (session.distanceKm) details.push(formatKm(session.distanceKm))
  if (session.elevationGainM) details.push(`${formatInt(session.elevationGainM)} m D+`)
  return `${SPORT_EMOJI[session.sport]} ${session.title} · ${details.join(', ')}`
}

/** Latest known morning check-in, to adapt the reminder. */
export interface LatestReadiness {
  date: IsoDate
  level: Readiness['level']
  action: Readiness['action']
}

const LEVEL_WORDS: Record<Readiness['level'], string> = { GREEN: 'au vert', ORANGE: 'à l’orange', RED: 'au rouge' }

/** Morning reminder, if at least one session is still planned today. */
export function morningMessage(sessions: PlannedSession[], options: { date: IsoDate; latest?: LatestReadiness }): PushMessage | undefined {
  const today = sessions.filter((s) => s.date === options.date && s.status === 'PLANNED')
  if (today.length === 0) return undefined
  const race = today.find((s) => s.type === 'RACE')
  if (race) {
    return { title: 'Jour de course 🏔️', body: `${race.title} : fais-toi confiance, tout le travail est fait. Bonne course !`, url: '/course', tag: 'morning' }
  }
  const key = today.find((s) => s.keySession)
  const lines = today.map(describeSession)
  const latest = options.latest
  const checkedToday = latest?.date === options.date
  const toAdapt = checkedToday && latest.action !== 'NONE'
  if (key && key.objective && !toAdapt) lines.push(key.objective)
  if (toAdapt) {
    lines.push(`Ton bilan du matin conseille ${latest.action === 'REST' ? 'le repos' : 'd’alléger'} : ouvre la séance pour l’adapter en un clic.`)
  } else if (!checkedToday && latest && latest.date === addDays(options.date, -1) && latest.level !== 'GREEN') {
    lines.push(`Ta forme était ${LEVEL_WORDS[latest.level]} hier : fais ton bilan avant de partir, Kairn allégera la séance si besoin.`)
  } else if (!checkedToday) {
    lines.push('Fais ton bilan du matin : Kairn ajuste la séance si besoin.')
  }
  return {
    title: toAdapt ? 'Séance du jour, à adapter' : key ? 'Séance clé aujourd’hui' : today.length > 1 ? 'Au programme aujourd’hui' : 'Séance du jour',
    body: lines.join('\n'),
    url: today.length === 1 ? `/seance/${today[0]!.id}` : '/',
    tag: 'morning',
  }
}

/** Morning check-in reminder, on days when a session is planned. */
export function checkInReminderMessage(sessions: PlannedSession[], date: IsoDate): PushMessage | undefined {
  if (!sessions.some((s) => s.date === date && s.status === 'PLANNED' && s.type !== 'RACE')) return undefined
  return {
    title: 'Ton bilan du matin',
    body: 'Sommeil, courbatures, fatigue : 20 secondes pour que Kairn adapte ta séance du jour.',
    url: '/',
    tag: 'check-in',
  }
}

export function weeklyMessage(summary: WeeklySummary): PushMessage {
  const highlight = summary.insights.find((i) => i.tone === 'ATTENTION') ?? summary.insights.find((i) => i.tone === 'POSITIVE')
  const lines = [summary.headline.replace(/^[^:]+: /, '')]
  if (highlight) lines.push(`${highlight.title}.`)
  if (summary.nextWeek) lines.push(`Semaine prochaine : ${summary.nextWeek.phaseLabel.toLowerCase()}${summary.nextWeek.isRecovery ? ' (allégée)' : ''}, ${formatMinutes(summary.nextWeek.targets.hours * 60)}.`)
  return {
    title: summary.week ? `Bilan de la semaine ${summary.week.index + 1}` : 'Bilan de la semaine',
    body: lines.join('\n'),
    url: `/bilan/${summary.weekStart}`,
    tag: `weekly-${summary.weekStart}`,
  }
}

export function analysisMessage(activity: { id: string; name: string }, analysis: WorkoutAnalysis): PushMessage {
  const lines = [analysis.headline]
  const key = analysis.insights.find((i) => i.topic === 'UPHILL' || i.topic === 'ENDURANCE')
  if (key) lines.push(key.text.split('. ')[0]!.replace(/\.$/, '') + '.')
  return { title: `${activity.name} analysée`, body: lines.join('\n'), url: `/activites/${activity.id}`, tag: `analysis-${activity.id}` }
}
