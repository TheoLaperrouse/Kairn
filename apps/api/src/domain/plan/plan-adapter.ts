import { addDays, daysBetween, weekday, type IsoDate } from '../shared/dates'
import { assertDomain } from '../shared/errors'
import { round1, roundTo } from '../shared/math'
import type { AdjustmentReason, PlanAdjustment, PlannedSession, SessionType, TrainingPlan } from './training-plan'

/**
 * Adapting the plan to real life: missed sessions, illness, injury, fatigue.
 * All functions are pure: they return a new plan and a log entry
 * explaining what changed, so the athlete stays in control.
 */

export interface AdaptationResult {
  plan: TrainingPlan
  adjustment?: PlanAdjustment
}

export interface AdaptationContext {
  today: IsoDate
  now: string
  availableDays: number[]
  newId: () => string
}

const INTENSE_TYPES: SessionType[] = ['HILL_REPEATS', 'UPHILL_THRESHOLD', 'DOWNHILL', 'FARTLEK', 'SIMULATION', 'HIKE_RUN']
const LONG_TYPES: SessionType[] = ['LONG_RUN', 'SIMULATION', 'BACK_TO_BACK']
/** A missed key session is only made up if it is less than 3 days old. */
const CATCH_UP_WINDOW_DAYS = 3
/** No make-up sessions in the last 10 days before the race: the taper comes first. */
const RACE_PROTECTION_DAYS = 10

const REASON_LABELS: Record<AdjustmentReason, string> = {
  MISSED_SESSION: 'séance manquée',
  ILLNESS: 'maladie',
  INJURY: 'blessure',
  UNAVAILABLE: 'indisponibilité',
  FATIGUE: 'fatigue',
}

const shortDate = (date: IsoDate) => {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

function weekIndexOf(plan: TrainingPlan, date: IsoDate): number {
  const week = [...plan.weeks].reverse().find((w) => w.startDate <= date)
  return week?.index ?? 0
}

function withSessions(plan: TrainingPlan, sessions: PlannedSession[], adjustment?: PlanAdjustment): AdaptationResult {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  if (!adjustment) return { plan: { ...plan, sessions: sorted } }
  return { plan: { ...plan, sessions: sorted, adjustments: [adjustment, ...(plan.adjustments ?? [])] }, adjustment }
}

function raceDate(plan: TrainingPlan): IsoDate | undefined {
  return plan.sessions.find((s) => s.type === 'RACE')?.date
}

/**
 * Makes up recently missed key sessions by moving them to an available day
 * in the next 6 days, without putting two hard sessions back to back. If no slot fits,
 * the session is dropped: better to lose a session than to pile up fatigue.
 */
export function rescheduleMissedSessions(plan: TrainingPlan, ctx: AdaptationContext): AdaptationResult {
  const race = raceDate(plan)
  const missed = plan.sessions.filter(
    (s) =>
      s.status === 'PLANNED' &&
      s.keySession &&
      s.sport === 'RUN' &&
      s.type !== 'RACE' &&
      !s.originalDate &&
      s.date < ctx.today &&
      daysBetween(s.date, ctx.today) <= CATCH_UP_WINDOW_DAYS,
  )
  if (missed.length === 0) return { plan }

  let sessions = [...plan.sessions]
  const details: string[] = []
  for (const session of missed) {
    const slot = findCatchUpSlot(sessions, session, ctx, race)
    if (slot) {
      const replaced = sessions.find((s) => s.date === slot && s.status === 'PLANNED' && s.sport === 'RUN' && !s.keySession)
      sessions = sessions.map((s) => {
        if (s.id === session.id) {
          return {
            ...s,
            date: slot,
            originalDate: s.date,
            weekIndex: weekIndexOf(plan, slot),
            adjustment: `Déplacée du ${shortDate(s.date)} au ${shortDate(slot)} : séance clé manquée.`,
          }
        }
        if (replaced && s.id === replaced.id) {
          return { ...s, status: 'SKIPPED', adjustment: `Remplacée par « ${session.title} » rattrapée ce jour-là.` }
        }
        return s
      })
      details.push(`« ${session.title} » déplacée au ${shortDate(slot)}${replaced ? ` (à la place de « ${replaced.title} »)` : ''}.`)
    } else {
      sessions = sessions.map((s) =>
        s.id === session.id
          ? { ...s, status: 'SKIPPED', adjustment: 'Non rattrapée : pas de créneau sans enchaîner deux séances dures.' }
          : s,
      )
      details.push(`« ${session.title} » du ${shortDate(session.date)} abandonnée : aucun créneau sûr pour la rattraper.`)
    }
  }

  return withSessions(plan, sessions, {
    id: ctx.newId(),
    createdAt: ctx.now,
    reason: 'MISSED_SESSION',
    summary: missed.length === 1 ? 'Une séance clé manquée a été prise en compte' : `${missed.length} séances clés manquées ont été prises en compte`,
    details,
  })
}

function findCatchUpSlot(
  sessions: PlannedSession[],
  missed: PlannedSession,
  ctx: AdaptationContext,
  race: IsoDate | undefined,
): IsoDate | undefined {
  const isLong = LONG_TYPES.includes(missed.type)
  const hardOn = (date: IsoDate) =>
    sessions.some((s) => s.date === date && s.id !== missed.id && s.status !== 'SKIPPED' && (s.keySession || s.type === 'BIKE_STRENGTH'))
  for (let offset = 0; offset < 6; offset++) {
    const date = addDays(ctx.today, offset)
    if (race && daysBetween(date, race) < RACE_PROTECTION_DAYS) return undefined
    if (!ctx.availableDays.includes(weekday(date))) continue
    if (hardOn(date) || hardOn(addDays(date, 1)) || (isLong && hardOn(addDays(date, -1)))) continue
    return date
  }
  return undefined
}

export interface Unavailability {
  from: IsoDate
  to: IsoDate
  reason: Exclude<AdjustmentReason, 'MISSED_SESSION' | 'FATIGUE'>
  /** Injury: cycling, swimming or the elliptical remain possible. */
  crossTrainingOk: boolean
}

/**
 * Declares a period without running (illness, injury, travel), then schedules a gradual
 * return: intensity removed and volume ramped from 50 % to 90 % over a period
 * proportional to the break.
 */
export function applyUnavailability(plan: TrainingPlan, period: Unavailability, ctx: AdaptationContext): AdaptationResult {
  assertDomain(period.from <= period.to, 'La date de fin doit suivre la date de début')
  const days = daysBetween(period.from, period.to) + 1
  assertDomain(days <= 120, 'Période trop longue : régénère plutôt le plan depuis les réglages')

  const label = REASON_LABELS[period.reason]
  const injury = period.reason === 'INJURY'
  const crossTrain = injury && period.crossTrainingOk
  const returnDays = period.reason === 'UNAVAILABLE' && days < 5 ? 0 : Math.min(Math.round(days * (injury ? 1.5 : 1)), 21)
  const returnEnd = addDays(period.to, returnDays)

  let skipped = 0
  let converted = 0
  let eased = 0
  const sessions = plan.sessions.map((s): PlannedSession => {
    if (s.status !== 'PLANNED' || s.type === 'RACE') return s
    if (s.date >= period.from && s.date <= period.to) {
      if (crossTrain && s.sport === 'RUN') {
        converted++
        return toCrossTraining(s, `Course remplacée par du sans-impact (${label}).`)
      }
      skipped++
      return { ...s, status: 'SKIPPED', adjustment: `Annulée : ${label} du ${shortDate(period.from)} au ${shortDate(period.to)}.` }
    }
    if (returnDays > 0 && s.date > period.to && s.date <= returnEnd && s.sport !== 'STRENGTH') {
      const progress = daysBetween(period.to, s.date) / returnDays
      const factor = 0.5 + 0.4 * progress
      if (s.type === 'BACK_TO_BACK' && progress < 0.5) {
        skipped++
        return { ...s, status: 'SKIPPED', adjustment: 'Supprimée : reprise progressive après un arrêt.' }
      }
      eased++
      return easeSession(s, factor, `Reprise progressive après ${label} : ${Math.round(factor * 100)} % du volume, sans intensité.`)
    }
    return s
  })

  const details = [
    skipped > 0 ? `${skipped} séance${skipped > 1 ? 's' : ''} annulée${skipped > 1 ? 's' : ''}.` : '',
    converted > 0 ? `${converted} sortie${converted > 1 ? 's' : ''} remplacée${converted > 1 ? 's' : ''} par du vélo / natation / elliptique.` : '',
    eased > 0 ? `${eased} séance${eased > 1 ? 's' : ''} allégée${eased > 1 ? 's' : ''} jusqu’au ${shortDate(returnEnd)} pour reprendre en douceur.` : '',
    injury ? 'En cas de douleur qui persiste, consulte un professionnel de santé avant de reprendre l’intensité.' : '',
  ].filter(Boolean)

  return withSessions(plan, sessions, {
    id: ctx.newId(),
    createdAt: ctx.now,
    reason: period.reason,
    summary: `Plan adapté : ${label} du ${shortDate(period.from)} au ${shortDate(period.to)}`,
    details,
  })
}

export type LightenMode = 'LIGHTEN' | 'REST'

/** Lightens (or cancels) a session following the morning check-in. */
export function lightenSession(session: PlannedSession, mode: LightenMode): PlannedSession {
  assertDomain(session.status === 'PLANNED', 'Seule une séance prévue peut être allégée')
  assertDomain(session.type !== 'RACE', 'On ne touche pas au jour de course')
  if (mode === 'REST') {
    return { ...session, status: 'SKIPPED', adjustment: 'Repos conseillé par le bilan du matin.' }
  }
  return easeSession(session, 0.7, 'Allégée suite au bilan du matin : endurance facile, 70 % de la durée.')
}

function easeSession(session: PlannedSession, factor: number, adjustment: string): PlannedSession {
  const durationMin = Math.max(20, roundTo(session.durationMin * factor, 5))
  const ratio = durationMin / session.durationMin
  if (session.sport === 'STRENGTH') return { ...session, adjustment, durationMin }
  const intense = INTENSE_TYPES.includes(session.type) || session.zone >= 4
  const run = session.sport === 'RUN'
  return {
    ...session,
    type: intense ? (run ? 'ENDURANCE' : 'BIKE_ENDURANCE') : session.type,
    title: intense ? (run ? 'Endurance facile' : 'Vélo en endurance') : session.title,
    objective: intense ? 'Entretenir le moteur sans ajouter de fatigue.' : session.objective,
    durationMin,
    distanceKm: session.distanceKm ? round1(session.distanceKm * ratio) : undefined,
    elevationGainM: session.elevationGainM ? roundTo(session.elevationGainM * ratio, 10) : undefined,
    zone: 2,
    keySession: false,
    steps: [{ kind: 'CONTINUOUS', label: run ? 'Footing en aisance respiratoire' : 'Pédalage souple', durationMin, zone: 2 }],
    adjustment,
  }
}

function toCrossTraining(session: PlannedSession, adjustment: string): PlannedSession {
  const durationMin = Math.max(30, roundTo(Math.min(session.durationMin, 90) * 0.8, 5))
  return {
    ...session,
    type: 'BIKE_ENDURANCE',
    sport: 'BIKE',
    title: 'Entretien sans impact',
    objective: 'Garder le moteur aérobie sans solliciter la zone blessée : vélo, natation, aquajogging ou elliptique.',
    durationMin,
    distanceKm: undefined,
    elevationGainM: undefined,
    zone: 2,
    keySession: false,
    steps: [{ kind: 'CONTINUOUS', label: 'Effort continu facile, sans douleur', durationMin, zone: 2 }],
    tips: ['Arrête immédiatement si la douleur se réveille.'],
    adjustment,
  }
}
