/** French formatting of the messages produced by the domain (analyses, summaries, notifications). */
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function formatInt(value: number): string {
  return integer.format(Math.round(value)).replace(/ /g, ' ')
}

export function formatKm(value: number): string {
  return `${oneDecimal.format(value)} km`
}

/** 52 min, 1 h 30, 3 h. */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

/** 0 = Monday. */
export function weekdayName(index: number): string {
  return WEEKDAYS[index] ?? ''
}
