/** Calendar date in ISO `YYYY-MM-DD` format, without time zone. */
export type IsoDate = string

const DAY_MS = 86_400_000

function toUtc(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function fromUtc(ms: number): IsoDate {
  return toIsoDate(new Date(ms))
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** 0 = Monday … 6 = Sunday (French convention). */
export function weekday(date: IsoDate): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7
}

export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -weekday(date))
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

/** Time zone used until the user has provided one (via their phone). */
export const DEFAULT_TIME_ZONE = 'Europe/Paris'

export interface LocalTime {
  date: IsoDate
  /** Minutes elapsed since midnight. */
  minutes: number
}

/** Wall-clock date and time of an instant in a time zone. */
export function localTime(instant: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}
