import type { CalendarEncoder, CalendarFeed } from '../../application/ports'
import type { PlannedSession, WorkoutStep } from '../../domain/plan/training-plan'
import { addDays } from '../../domain/shared/dates'
import { formatInt, formatKm, formatMinutes } from '../../domain/shared/format'

/**
 * Abonnement iCalendar (RFC 5545) au plan : une journée entière par séance, mise à jour
 * à chaque relecture par l'agenda (Google, Apple, Outlook). Les séances annulées disparaissent,
 * les séances déplacées changent de jour (même UID).
 */
const SPORT_EMOJI = { RUN: '🏃', BIKE: '🚴', STRENGTH: '💪' } as const

export class IcsCalendarEncoder implements CalendarEncoder {
  encode(feed: CalendarFeed): string {
    const stamp = utcStamp(feed.generatedAt)
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kairn//Plan d’entraînement//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escape(feed.name)}`,
      'X-WR-CALDESC:Séances du plan Kairn',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
    ]
    for (const session of feed.sessions) {
      if (session.status === 'SKIPPED') continue
      const url = `${feed.baseUrl}${session.type === 'COURSE' ? '/course' : `/seance/${session.id}`}`
      lines.push(
        'BEGIN:VEVENT',
        `UID:${session.id}@kairn`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compact(session.date)}`,
        `DTEND;VALUE=DATE:${compact(addDays(session.date, 1))}`,
        `SUMMARY:${escape(summary(session, feed))}`,
        `DESCRIPTION:${escape(description(session, url))}`,
        `URL:${url}`,
        `CATEGORIES:${escape(session.keySession ? 'Séance clé' : session.sport === 'STRENGTH' ? 'Renforcement' : 'Entraînement')}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      )
    }
    lines.push('END:VCALENDAR')
    return `${lines.map(fold).join('\r\n')}\r\n`
  }
}

function summary(session: PlannedSession, feed: CalendarFeed): string {
  if (session.type === 'COURSE') return `🏁 ${feed.goal?.name ?? session.title}`
  const done = session.status === 'DONE' ? '✓ ' : ''
  const key = session.keySession ? ' ★' : ''
  return `${done}${SPORT_EMOJI[session.sport]} ${session.title} · ${formatMinutes(session.durationMin)}${key}`
}

function stepLine(step: WorkoutStep): string {
  const repeat = step.repeat && step.repeat > 1 ? `${step.repeat} × ` : ''
  return `• ${repeat}${step.label} — ${formatMinutes(step.durationMin)} (Z${step.zone})${step.terrain ? `, ${step.terrain}` : ''}`
}

function description(session: PlannedSession, url: string): string {
  const facts = [formatMinutes(session.durationMin)]
  if (session.distanceKm) facts.push(formatKm(session.distanceKm))
  if (session.elevationGainM) facts.push(`${formatInt(session.elevationGainM)} m D+`)
  const parts = [facts.join(' · ')]
  if (session.objective) parts.push(session.objective)
  if (session.steps.length) parts.push(session.steps.map(stepLine).join('\n'))
  if (session.tips.length) parts.push(session.tips.map((t) => `💡 ${t}`).join('\n'))
  if (session.adjustment) parts.push(`Modifiée par Kairn : ${session.adjustment}`)
  parts.push(`Ouvrir dans Kairn : ${url}`)
  return parts.join('\n\n')
}

function compact(date: string): string {
  return date.replace(/-/g, '')
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Échappement des valeurs texte (RFC 5545 §3.3.11). */
export function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Repli des lignes à 75 octets sans couper un caractère UTF-8 (RFC 5545 §3.1). */
export function fold(line: string): string {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = Buffer.byteLength(char)
    const limit = parts.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}
