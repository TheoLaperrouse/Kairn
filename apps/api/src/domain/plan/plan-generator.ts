import {
  RUNNING_SESSIONS_BY_LEVEL,
  TRAINING_SPEED_KME,
  type AthleteProfile,
  type ExperienceLevel,
} from '../athlete/athlete-profile'
import {
  RECOMMENDED_WEEKS,
  categorize,
  estimateRaceDurationH,
  kmEffort,
  verticalRatio,
  type RaceGoal,
  type TrailCategory,
} from '../goal/race-goal'
import { addDays, daysBetween, startOfWeek, weekday, type IsoDate } from '../shared/dates'
import { DomainError } from '../shared/errors'
import type { StrengthRoutine } from '../strength/routine'
import type { TrainingPhase } from './phase'
import { describeSession } from './session-library'
import {
  SESSION_SPORT,
  type PlanWeek,
  type PlannedSession,
  type SessionType,
  type TrainingPlan,
} from './training-plan'

export type RoutineSummary = Pick<StrengthRoutine, 'id' | 'name' | 'phases' | 'durationMin'>

export interface PlanRequest {
  planId: string
  goal: RaceGoal
  profile: AthleteProfile
  today: IsoDate
  createdAt: string
  routines: RoutineSummary[]
}

/** Volume hebdomadaire au pic (h) pour un coureur intermédiaire. */
const PEAK_HOURS: Record<TrailCategory, number> = { XS: 5, S: 6.5, M: 8, L: 10, XL: 12, XXL: 14 }
const LEVEL_VOLUME_FACTOR: Record<ExperienceLevel, number> = {
  DEBUTANT: 0.75,
  INTERMEDIAIRE: 1,
  CONFIRME: 1.2,
  EXPERT: 1.4,
}
/** Durée maximale de la sortie longue (min). */
const MAX_LONG_RUN_MIN: Record<TrailCategory, number> = { XS: 110, S: 180, M: 240, L: 300, XL: 360, XXL: 420 }
const TAPER_WEEKS: Record<TrailCategory, number> = { XS: 1, S: 1, M: 2, L: 2, XL: 3, XXL: 3 }
const TAPER_FACTORS: Record<number, number[]> = { 1: [0.6], 2: [0.75, 0.58], 3: [0.85, 0.72, 0.58] }
const RECOVERY_FACTOR = 0.65
const RACE_WEEK_FACTOR = 0.3
const MIN_WEEKS = 4

const QUALITY_TYPES: SessionType[] = ['COTES_COURTES', 'SEUIL_MONTEE', 'RANDO_COURSE', 'DESCENTE', 'FARTLEK']
const FIXED_DURATION: Partial<Record<SessionType, number>> = {
  COTES_COURTES: 55,
  SEUIL_MONTEE: 70,
  RANDO_COURSE: 80,
  DESCENTE: 55,
  FARTLEK: 50,
  RECUPERATION: 35,
}

const PHASE_FOCUS: Record<TrainingPhase, string> = {
  FONCIER: 'Construire le moteur aérobie, renforcer les structures (tendons, chevilles).',
  DEVELOPPEMENT: 'Seuil en montée, force excentrique et montée en volume.',
  SPECIFIQUE: 'Reproduire les exigences de la course : D+, durée, nutrition, nuit.',
  AFFUTAGE: 'Réduire le volume, garder un peu d’intensité : arriver frais.',
  COURSE: 'Repos actif, sommeil, charge glucidique les 2 derniers jours.',
}

interface WeekSkeleton {
  index: number
  startDate: IsoDate
  phase: TrainingPhase
  isRecovery: boolean
  hours: number
  /** Avancement dans la phase (0 → 1). */
  progress: number
}

export function generatePlan(request: PlanRequest): TrainingPlan {
  const { goal, profile, today } = request
  const category = categorize(goal)
  const start = startOfWeek(today)
  const raceWeek = startOfWeek(goal.raceDate)
  const totalWeeks = daysBetween(start, raceWeek) / 7 + 1

  if (daysBetween(today, goal.raceDate) < 0) throw new DomainError('La date de course est déjà passée')
  if (totalWeeks < MIN_WEEKS) {
    throw new DomainError(`Il faut au moins ${MIN_WEEKS} semaines avant la course pour générer un plan`)
  }

  const warnings = collectWarnings(goal, profile, category, totalWeeks)
  const skeleton = buildSkeleton(start, totalWeeks, category, profile, goal)
  const raceDurationH = estimateRaceDurationH(goal, profile.level)

  const sessions: PlannedSession[] = []
  const weeks: PlanWeek[] = skeleton.map((week) => {
    const weekSessions = buildWeekSessions(week, skeleton, request, category, raceDurationH).filter(
      (s) => s.date >= today,
    )
    sessions.push(...weekSessions)
    const runs = weekSessions.filter((s) => s.sport === 'RUN' && s.type !== 'COURSE')
    return {
      index: week.index,
      startDate: week.startDate,
      phase: week.phase,
      isRecovery: week.isRecovery,
      targetHours: round1(
        weekSessions.filter((s) => s.sport !== 'STRENGTH' && s.type !== 'COURSE').reduce((sum, s) => sum + s.durationMin, 0) / 60,
      ),
      targetKm: Math.round(runs.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0)),
      targetElevationM: roundTo(runs.reduce((sum, s) => sum + (s.elevationGainM ?? 0), 0), 50),
      focus: week.isRecovery ? 'Semaine allégée : assimiler le travail des semaines précédentes.' : PHASE_FOCUS[week.phase],
    }
  })

  return {
    id: request.planId,
    goalId: goal.id,
    createdAt: request.createdAt,
    startDate: start,
    weeks,
    sessions,
    warnings,
  }
}

function collectWarnings(goal: RaceGoal, profile: AthleteProfile, category: TrailCategory, totalWeeks: number): string[] {
  const warnings: string[] = []
  const recommended = RECOMMENDED_WEEKS[category]
  if (totalWeeks < recommended) {
    warnings.push(
      `Préparation courte : ${totalWeeks} semaines pour ${recommended} conseillées sur ce format. Le plan est compressé, sois à l’écoute des signaux de fatigue.`,
    )
  }
  const idealPeak = PEAK_HOURS[category] * LEVEL_VOLUME_FACTOR[profile.level]
  if (profile.maxWeeklyHours < idealPeak * 0.8) {
    warnings.push(
      `Ton volume maximum (${profile.maxWeeklyHours} h) est en dessous des ~${Math.round(idealPeak)} h conseillées : la qualité des sorties longues sera déterminante.`,
    )
  }
  if (profile.terrain === 'PLAT' && verticalRatio(goal) > 40) {
    warnings.push(
      'Course très verticale et terrain plat : planifie quelques week-ends choc en montagne et exploite escaliers et tapis incliné.',
    )
  }
  if ((goal.maxAltitudeM ?? 0) >= 2_000) {
    warnings.push('Passages au-dessus de 2 000 m : si possible, arrive quelques jours avant pour t’acclimater.')
  }
  if (profile.level === 'DEBUTANT' && (category === 'XL' || category === 'XXL')) {
    warnings.push('Un ultra XXL comme premier objectif est ambitieux : une course préparatoire de 50-80 km est vivement conseillée.')
  }
  return warnings
}

function buildSkeleton(
  start: IsoDate,
  totalWeeks: number,
  category: TrailCategory,
  profile: AthleteProfile,
  goal: RaceGoal,
): WeekSkeleton[] {
  const taper = Math.min(TAPER_WEEKS[category], Math.max(totalWeeks - 3, 1))
  const buildWeeks = totalWeeks - 1 - taper
  const foncier = Math.max(1, Math.round(buildWeeks * 0.4))
  const developpement = Math.max(1, Math.round(buildWeeks * 0.33))
  const specifique = Math.max(buildWeeks - foncier - developpement, 1)

  const phases: TrainingPhase[] = [
    ...Array<TrainingPhase>(foncier).fill('FONCIER'),
    ...Array<TrainingPhase>(developpement).fill('DEVELOPPEMENT'),
    ...Array<TrainingPhase>(specifique).fill('SPECIFIQUE'),
  ].slice(0, buildWeeks)
  while (phases.length < buildWeeks) phases.push('SPECIFIQUE')

  const peak = Math.min(PEAK_HOURS[category] * LEVEL_VOLUME_FACTOR[profile.level], profile.maxWeeklyHours)
  const currentHours =
    kmEffort(profile.currentWeeklyKm, profile.currentWeeklyElevationM) / TRAINING_SPEED_KME[profile.level]
  const startHours = Math.min(clamp(currentHours * 1.05, peak * 0.45, peak * 0.85), peak)

  // Cycle 3:1 — toutes les 4e semaines de construction sont allégées, sauf juste avant l'affûtage.
  const isRecovery = phases.map((_, i) => (i + 1) % 4 === 0 && i < buildWeeks - 1)
  const loadingWeeks = isRecovery.filter((r) => !r).length
  const rampLength = Math.max(loadingWeeks * 0.85, 1)

  const weeks: WeekSkeleton[] = []
  let loadingIndex = 0
  let previousHours = startHours
  for (let i = 0; i < buildWeeks; i++) {
    const phase = phases[i]!
    let hours: number
    if (isRecovery[i]) {
      hours = previousHours * RECOVERY_FACTOR
    } else {
      hours = startHours + (peak - startHours) * Math.min(1, loadingIndex / rampLength)
      loadingIndex++
      previousHours = hours
    }
    const phaseStart = phases.indexOf(phase)
    const phaseLength = phases.lastIndexOf(phase) - phaseStart + 1
    weeks.push({
      index: i,
      startDate: addDays(start, i * 7),
      phase,
      isRecovery: isRecovery[i]!,
      hours,
      progress: phaseLength > 1 ? (i - phaseStart) / (phaseLength - 1) : 1,
    })
  }

  const taperFactors = TAPER_FACTORS[taper]!
  taperFactors.forEach((factor, t) => {
    const index = buildWeeks + t
    weeks.push({
      index,
      startDate: addDays(start, index * 7),
      phase: 'AFFUTAGE',
      isRecovery: false,
      hours: peak * factor,
      progress: taperFactors.length > 1 ? t / (taperFactors.length - 1) : 1,
    })
  })

  weeks.push({
    index: totalWeeks - 1,
    startDate: startOfWeek(goal.raceDate),
    phase: 'COURSE',
    isRecovery: false,
    hours: peak * RACE_WEEK_FACTOR,
    progress: 1,
  })
  return weeks
}

function runTypesFor(week: WeekSkeleton, goal: RaceGoal, category: TrailCategory, isSimulationWeek: boolean): SessionType[] {
  const steep = goal.polesAllowed || verticalRatio(goal) >= 40
  const ultra = category === 'L' || category === 'XL' || category === 'XXL'
  if (week.isRecovery) return ['SORTIE_LONGUE', 'ENDURANCE', 'RECUPERATION', 'ENDURANCE', 'FARTLEK', 'RECUPERATION']
  switch (week.phase) {
    case 'FONCIER':
      return ['SORTIE_LONGUE', 'COTES_COURTES', 'ENDURANCE', 'FARTLEK', 'ENDURANCE', 'RECUPERATION']
    case 'DEVELOPPEMENT':
      return [
        'SORTIE_LONGUE',
        'SEUIL_MONTEE',
        'ENDURANCE',
        week.index % 2 === 0 && steep ? 'RANDO_COURSE' : 'DESCENTE',
        'ENDURANCE',
        'COTES_COURTES',
      ]
    case 'SPECIFIQUE':
      return [
        isSimulationWeek ? 'SIMULATION' : 'SORTIE_LONGUE',
        ultra ? 'BACK_TO_BACK' : 'ENDURANCE',
        'SEUIL_MONTEE',
        steep ? 'RANDO_COURSE' : 'DESCENTE',
        'ENDURANCE',
        steep ? 'DESCENTE' : 'ENDURANCE',
      ]
    case 'AFFUTAGE':
      return ['SORTIE_LONGUE', 'COTES_COURTES', 'ENDURANCE', 'ENDURANCE', 'RECUPERATION', 'ENDURANCE']
    case 'COURSE':
      return ['ENDURANCE', 'RECUPERATION', 'ENDURANCE']
  }
}

function buildWeekSessions(
  week: WeekSkeleton,
  skeleton: WeekSkeleton[],
  request: PlanRequest,
  category: TrailCategory,
  raceDurationH: number,
): PlannedSession[] {
  const { goal, profile, planId } = request
  const days = [...profile.availableDays].sort((a, b) => a - b)
  const simulationWeek = pickSimulationWeek(skeleton)
  const raceDay = week.phase === 'COURSE' ? weekday(goal.raceDate) : undefined

  let runCount = Math.min(RUNNING_SESSIONS_BY_LEVEL[profile.level], days.length)
  if (week.isRecovery) runCount = Math.max(3, runCount - 1)
  if (week.phase === 'COURSE') runCount = Math.min(runCount, 3)
  const runTypes = runTypesFor(week, goal, category, simulationWeek === week.index).slice(0, runCount)

  // Répartition du volume : le vélo prend ~20 % des heures s'il est activé.
  const cycling = profile.crossTraining.cycling && week.phase !== 'COURSE'
  const totalMin = week.hours * 60
  const runMin = cycling ? totalMin * 0.8 : totalMin
  const durations = allocateDurations(runTypes, runMin, category, profile.level, week)

  const raceDayAvailable = raceDay === undefined ? days : days.filter((d) => d < raceDay - 1 || d === raceDay - 2)
  const placement = placeRuns(runTypes, raceDayAvailable.length >= 2 ? raceDayAvailable : days, profile.longRunDay, raceDay)

  const sessions: Array<Omit<PlannedSession, 'id'>> = []
  const ratio = effectiveVerticalRatio(goal, profile)
  for (const { type, day } of placement) {
    const durationMin = durations.get(type)?.shift() ?? 45
    sessions.push(createSession(type, addDays(week.startDate, day), durationMin, week, request, ratio, raceDurationH))
  }

  if (cycling) {
    const bikeMin = totalMin - runMin
    sessions.push(...placeCycling(week, profile, sessions, bikeMin, request, ratio, raceDurationH))
  }
  if (profile.crossTraining.strength) {
    sessions.push(...placeStrength(week, profile, sessions, request))
  }
  if (week.phase === 'COURSE') {
    sessions.push(createSession('COURSE', goal.raceDate, Math.round(raceDurationH * 60), week, request, ratio, raceDurationH))
  }

  return sessions
    .sort((a, b) => a.date.localeCompare(b.date) || SPORT_ORDER[a.sport] - SPORT_ORDER[b.sport])
    .map((s, n) => ({ ...s, id: `${planId}-w${week.index}-${n}` }))
}

const SPORT_ORDER = { RUN: 0, BIKE: 1, STRENGTH: 2 } as const

function pickSimulationWeek(skeleton: WeekSkeleton[]): number | undefined {
  const loading = skeleton.filter((w) => w.phase === 'SPECIFIQUE' && !w.isRecovery)
  if (loading.length === 0) return undefined
  return loading[Math.max(loading.length - 2, 0)]!.index
}

function allocateDurations(
  types: SessionType[],
  runMin: number,
  category: TrailCategory,
  level: ExperienceLevel,
  week: WeekSkeleton,
): Map<SessionType, number[]> {
  const maxLong = MAX_LONG_RUN_MIN[category] * (level === 'DEBUTANT' ? 0.85 : 1)
  const hasBackToBack = types.includes('BACK_TO_BACK')
  const longShare = week.phase === 'COURSE' ? 0 : hasBackToBack ? 0.28 : 0.35
  const durations = new Map<SessionType, number[]>()
  const push = (type: SessionType, min: number) => durations.set(type, [...(durations.get(type) ?? []), roundTo(min, 5)])

  let remaining = runMin
  const longMin = clamp(runMin * longShare, 60, maxLong)
  for (const type of types) {
    if (type === 'SORTIE_LONGUE') push(type, longMin)
    else if (type === 'SIMULATION') push(type, Math.min(longMin * 1.25, maxLong * 1.1))
    else if (type === 'BACK_TO_BACK') push(type, Math.max(longMin * 0.55, 45))
    else continue
    remaining -= durations.get(type)!.at(-1)!
  }
  for (const type of types) {
    const fixed = FIXED_DURATION[type]
    if (fixed === undefined) continue
    push(type, fixed)
    remaining -= fixed
  }
  const easy = types.filter((t) => t === 'ENDURANCE')
  const easyMin = easy.length > 0 ? clamp(remaining / easy.length, 35, 90) : 0
  easy.forEach((t) => push(t, week.phase === 'COURSE' ? 35 : easyMin))
  remaining -= easyMin * easy.length

  // Volume non absorbé par les footings : il allonge la sortie longue puis le back-to-back.
  if (remaining > 0 && week.phase !== 'COURSE' && !week.isRecovery) {
    const extend = (type: SessionType, cap: number) => {
      const list = durations.get(type)
      if (!list?.length || remaining <= 0) return
      const extra = Math.max(Math.min(remaining, cap - list[0]!), 0)
      list[0] = roundTo(list[0]! + extra, 5)
      remaining -= extra
    }
    extend('SORTIE_LONGUE', maxLong)
    extend('SIMULATION', maxLong * 1.1)
    extend('BACK_TO_BACK', (durations.get('SORTIE_LONGUE')?.[0] ?? durations.get('SIMULATION')?.[0] ?? 0) * 0.6)
  }
  return durations
}

interface Placement {
  type: SessionType
  day: number
}

/** Distance circulaire entre deux jours (la semaine suivante recommence). */
function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 7 - d)
}

function placeRuns(types: SessionType[], days: number[], longRunDay: number, raceDay?: number): Placement[] {
  const free = new Set(days)
  const placed: Placement[] = []
  const take = (type: SessionType, day: number) => {
    free.delete(day)
    placed.push({ type, day })
  }

  const longType = types.find((t) => t === 'SORTIE_LONGUE' || t === 'SIMULATION')
  const longDay = free.has(longRunDay) ? longRunDay : days.at(-1)!
  if (longType && raceDay === undefined) take(longType, longDay)

  if (types.includes('BACK_TO_BACK')) {
    const candidates = [longDay + 1, longDay - 1].map((d) => (d + 7) % 7)
    const b2bDay = candidates.find((d) => free.has(d))
    if (b2bDay !== undefined) take('BACK_TO_BACK', b2bDay)
  }

  const hardDays = () => placed.map((p) => p.day)
  for (const type of types.filter((t) => QUALITY_TYPES.includes(t))) {
    const options = [...free].filter((d) => d !== (longDay + 6) % 7 || free.size <= 1)
    if (options.length === 0) break
    const best = options.reduce((bestDay, day) => {
      const score = Math.min(...hardDays().map((h) => dayDistance(h, day)), 7)
      const bestScore = Math.min(...hardDays().map((h) => dayDistance(h, bestDay)), 7)
      return score > bestScore ? day : bestDay
    })
    take(type, best)
  }

  const easyTypes = types.filter((t) => t === 'ENDURANCE' || t === 'RECUPERATION')
  if (raceDay !== undefined && longType) easyTypes.unshift('ENDURANCE')
  for (const type of easyTypes) {
    if (free.size === 0) break
    const dayAfterLong = (longDay + 1) % 7
    const day = type === 'RECUPERATION' && free.has(dayAfterLong) ? dayAfterLong : [...free][0]!
    take(type, day)
  }
  return placed
}

function placeCycling(
  week: WeekSkeleton,
  profile: AthleteProfile,
  existing: Array<Omit<PlannedSession, 'id'>>,
  bikeMin: number,
  request: PlanRequest,
  ratio: number,
  raceDurationH: number,
): Array<Omit<PlannedSession, 'id'>> {
  const count = profile.crossTraining.cyclingSessionsPerWeek
  const usedDays = new Set(existing.map((s) => weekday(s.date)))
  const freeDays = profile.availableDays.filter((d) => !usedDays.has(d))
  const result: Array<Omit<PlannedSession, 'id'>> = []

  for (let n = 0; n < count; n++) {
    const type: SessionType =
      (week.phase === 'DEVELOPPEMENT' || week.phase === 'SPECIFIQUE') && !week.isRecovery && n === 0 ? 'VELO_FORCE' : 'VELO_ENDURANCE'
    const duration = clamp(roundTo(bikeMin / count, 5), 45, 150)
    let day = freeDays.shift()
    if (day === undefined) {
      // Pas de jour libre : le vélo remplace un footing d'endurance (moins d'impacts).
      const runs = existing.filter((s) => s.sport === 'RUN')
      const swap = existing.find((s) => s.type === 'ENDURANCE')
      if (!swap || runs.length <= 3) break
      existing.splice(existing.indexOf(swap), 1)
      day = weekday(swap.date)
    }
    result.push(createSession(type, addDays(week.startDate, day), duration, week, request, ratio, raceDurationH))
  }
  return result
}

function placeStrength(
  week: WeekSkeleton,
  profile: AthleteProfile,
  existing: Array<Omit<PlannedSession, 'id'>>,
  request: PlanRequest,
): Array<Omit<PlannedSession, 'id'>> {
  const tapering = week.phase === 'AFFUTAGE' || week.phase === 'COURSE' || week.isRecovery
  const count = tapering ? 1 : profile.crossTraining.strengthSessionsPerWeek
  const routines = pickRoutines(request.routines, week, count)
  if (routines.length === 0) return []

  const hard = new Set(existing.filter((s) => s.keySession || s.type === 'VELO_FORCE').map((s) => weekday(s.date)))
  const dayBeforeLong = (profile.longRunDay + 6) % 7
  const lastAllowed = week.phase === 'COURSE' ? weekday(request.goal.raceDate) - 4 : 6
  const candidates = profile.availableDays
    .filter((d) => d <= lastAllowed && d !== profile.longRunDay && d !== dayBeforeLong)
    .sort((a, b) => Number(hard.has(a)) - Number(hard.has(b)) || a - b)

  const chosen: number[] = []
  for (const day of candidates) {
    if (chosen.length === routines.length) break
    if (chosen.every((c) => Math.abs(c - day) >= 2)) chosen.push(day)
  }
  return chosen.map((day, i) => {
    const routine = routines[i]!
    const session = createSession('RENFORCEMENT', addDays(week.startDate, day), routine.durationMin, week, request, 0, 0)
    return { ...session, title: routine.name, routineId: routine.id }
  })
}

function pickRoutines(routines: RoutineSummary[], week: WeekSkeleton, count: number): RoutineSummary[] {
  const phase: TrainingPhase = week.phase
  const eligible = routines.filter((r) => r.phases.includes(phase))
  if (eligible.length === 0) return []
  if (week.isRecovery) {
    return [eligible.reduce((a, b) => (a.durationMin <= b.durationMin ? a : b))]
  }
  // Les routines les plus complètes d'abord, en alternant d'une semaine à l'autre.
  const sorted = [...eligible].sort((a, b) => b.durationMin - a.durationMin || a.id.localeCompare(b.id))
  return Array.from({ length: Math.min(count, sorted.length) }, (_, i) => sorted[(week.index + i) % sorted.length]!)
}

/** Ratio D+/km réaliste à l'entraînement : borné par le terrain disponible. */
function effectiveVerticalRatio(goal: RaceGoal, profile: AthleteProfile): number {
  const cap = profile.terrain === 'PLAT' ? 15 : profile.terrain === 'COLLINES' ? 35 : Infinity
  return Math.min(verticalRatio(goal), cap)
}

function createSession(
  type: SessionType,
  date: IsoDate,
  durationMin: number,
  week: WeekSkeleton,
  request: PlanRequest,
  ratio: number,
  raceDurationH: number,
): Omit<PlannedSession, 'id'> {
  const { goal, profile } = request
  const content = describeSession(type, {
    durationMin,
    phase: week.phase,
    progress: week.progress,
    goal,
    terrain: profile.terrain,
    raceDurationH,
  })
  const sport = SESSION_SPORT[type]
  const base: Omit<PlannedSession, 'id'> = {
    weekIndex: week.index,
    date,
    type,
    sport,
    title: content.title,
    objective: content.objective,
    durationMin: Math.round(durationMin),
    zone: content.zone,
    keySession: content.keySession,
    steps: content.steps,
    tips: content.tips,
    status: 'PLANNED',
  }
  if (sport !== 'RUN') return base
  if (type === 'COURSE') return { ...base, distanceKm: goal.distanceKm, elevationGainM: goal.elevationGainM }

  const sessionRatio = ratio * content.verticalShare
  const effort = (durationMin / 60) * TRAINING_SPEED_KME[profile.level] * (content.zone >= 4 ? 1.05 : 1)
  const distanceKm = effort / (1 + sessionRatio / 100)
  return {
    ...base,
    distanceKm: round1(distanceKm),
    elevationGainM: roundTo(distanceKm * sessionRatio, 10),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}
