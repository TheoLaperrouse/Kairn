const NIGHT_START_MIN = 21 * 60
const NIGHT_END_MIN = 6 * 60 + 30

/** « 27 h 25 », « 45 min ». */
export function formatHours(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')}`
}

/** Marge signée : « +1 h 20 », « −35 min ». */
export function formatMargin(hours: number): string {
  return `${hours < 0 ? '−' : '+'}${formatHours(Math.abs(hours))}`
}

export interface ClockTime {
  clock: string
  day: number
  night: boolean
}

function startMinutes(startTime: string): number {
  const [h, m] = startTime.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Heure locale atteinte après `elapsedH` heures de course. */
export function clockAt(startTime: string, elapsedH: number): ClockTime {
  const total = startMinutes(startTime) + Math.round(elapsedH * 60)
  const minuteOfDay = ((total % 1440) + 1440) % 1440
  return {
    clock: `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`,
    day: Math.floor(total / 1440),
    night: minuteOfDay >= NIGHT_START_MIN || minuteOfDay < NIGHT_END_MIN,
  }
}

export function dayLabel(day: number): string {
  return day === 0 ? 'Jour J' : `J+${day}`
}

/** Convertit une heure d'horloge (« 14:30 ») en heures de course depuis le départ, en supposant le premier passage possible. */
export function clockToElapsed(startTime: string, clock: string, day = 0): number {
  const target = startMinutes(clock) + day * 1440
  let delta = target - startMinutes(startTime)
  if (delta < 0 && day === 0) delta += 1440
  return Math.round((delta / 60) * 100) / 100
}

export function interpolate<T>(rows: T[], x: number, getX: (row: T) => number, getY: (row: T) => number): number {
  if (rows.length === 0) return 0
  if (x <= getX(rows[0]!)) return getY(rows[0]!)
  for (let i = 1; i < rows.length; i++) {
    const b = rows[i]!
    if (getX(b) >= x) {
      const a = rows[i - 1]!
      const span = getX(b) - getX(a) || 1e-9
      return getY(a) + ((x - getX(a)) / span) * (getY(b) - getY(a))
    }
  }
  return getY(rows.at(-1)!)
}
