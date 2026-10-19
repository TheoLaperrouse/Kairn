import type { WorkoutAnalysis } from '../analysis/workout-analysis'
import type { PlannedSession } from '../plan/training-plan'
import { addDays, weekday, type IsoDate } from '../shared/dates'
import { assertDomain } from '../shared/errors'
import { formatInt, formatKm, formatMinutes } from '../shared/format'
import type { WeeklySummary } from '../summary/weekly-summary'

/** Message affiché par le téléphone ; `url` est ouverte au toucher. */
export interface PushMessage {
  title: string
  body: string
  url: string
  /** Remplace une notification précédente de même étiquette au lieu de s'empiler. */
  tag: string
}

export interface NotificationSettings {
  /** Fuseau IANA de l'utilisateur, ex. « Europe/Paris ». */
  timeZone: string
  morning: { enabled: boolean; time: string }
  weekly: { enabled: boolean; time: string }
  analysis: { enabled: boolean }
}

/** Dernières notifications envoyées : évite les doublons, y compris après un redémarrage. */
export interface NotificationState {
  lastMorning?: IsoDate
  lastWeekly?: IsoDate
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  timeZone: 'Europe/Paris',
  morning: { enabled: true, time: '07:00' },
  weekly: { enabled: true, time: '19:00' },
  analysis: { enabled: true },
}

/** Après un redémarrage, une notification du matin manquée part encore dans ce délai. */
const MORNING_CATCH_UP_MIN = 4 * 60
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateNotificationSettings(settings: NotificationSettings): void {
  assertDomain(TIME_PATTERN.test(settings.morning.time), 'Heure du rappel du matin invalide')
  assertDomain(TIME_PATTERN.test(settings.weekly.time), 'Heure du bilan hebdomadaire invalide')
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

export interface LocalTime {
  date: IsoDate
  /** Minutes écoulées depuis minuit. */
  minutes: number
}

/** Date et heure murales dans le fuseau de l'utilisateur. */
export function localTime(now: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h! * 60 + m!
}

export function isMorningDue(settings: NotificationSettings, state: NotificationState, now: LocalTime): boolean {
  if (!settings.morning.enabled || state.lastMorning === now.date) return false
  const at = minutesOf(settings.morning.time)
  return now.minutes >= at && now.minutes < at + MORNING_CATCH_UP_MIN
}

/** Le bilan part le dimanche à l'heure choisie, ou le lundi matin s'il a été manqué. */
export function dueWeeklySummary(settings: NotificationSettings, state: NotificationState, now: LocalTime): IsoDate | undefined {
  if (!settings.weekly.enabled) return undefined
  const day = weekday(now.date)
  const sunday = day === 6 && now.minutes >= minutesOf(settings.weekly.time)
  const mondayCatchUp = day === 0 && now.minutes < 12 * 60
  if (!sunday && !mondayCatchUp) return undefined
  const weekStart = addDays(now.date, sunday ? -6 : -7)
  return state.lastWeekly === weekStart ? undefined : weekStart
}

const SPORT_EMOJI = { RUN: '🏃', BIKE: '🚴', STRENGTH: '💪' } as const

function describeSession(session: PlannedSession): string {
  const details = [formatMinutes(session.durationMin)]
  if (session.distanceKm) details.push(formatKm(session.distanceKm))
  if (session.elevationGainM) details.push(`${formatInt(session.elevationGainM)} m D+`)
  return `${SPORT_EMOJI[session.sport]} ${session.title} · ${details.join(', ')}`
}

/** Rappel du matin, s'il reste au moins une séance prévue aujourd'hui. */
export function morningMessage(sessions: PlannedSession[], options: { checkInDone: boolean; date: IsoDate }): PushMessage | undefined {
  const today = sessions.filter((s) => s.date === options.date && s.status === 'PLANNED')
  if (today.length === 0) return undefined
  const race = today.find((s) => s.type === 'COURSE')
  if (race) {
    return { title: 'Jour de course 🏔️', body: `${race.title} : fais-toi confiance, tout le travail est fait. Bonne course !`, url: '/course', tag: 'morning' }
  }
  const key = today.find((s) => s.keySession)
  const lines = today.map(describeSession)
  if (key && key.objective) lines.push(key.objective)
  if (!options.checkInDone) lines.push('Fais ton bilan du matin : Kairn ajuste la séance si besoin.')
  return {
    title: key ? 'Séance clé aujourd’hui' : today.length > 1 ? 'Au programme aujourd’hui' : 'Séance du jour',
    body: lines.join('\n'),
    url: today.length === 1 ? `/seance/${today[0]!.id}` : '/',
    tag: 'morning',
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
  const key = analysis.insights.find((i) => i.topic === 'MONTEE' || i.topic === 'ENDURANCE')
  if (key) lines.push(key.text.split('. ')[0]!.replace(/\.$/, '') + '.')
  return { title: `${activity.name} analysée`, body: lines.join('\n'), url: `/activites/${activity.id}`, tag: `analysis-${activity.id}` }
}
