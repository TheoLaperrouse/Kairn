/** Date calendaire au format ISO `YYYY-MM-DD`, sans fuseau horaire. */
export type IsoDate = string

const DAY_MS = 86_400_000

function toUtc(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** 0 = lundi … 6 = dimanche (convention française). */
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
