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
import { clamp, round1, roundTo } from '../shared/math'
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
  /** Actual training speed (km-effort/h) measured on recent activities; otherwise, the level's typical value. */
  trainingSpeedKme?: number
}

/** Peak weekly volume (h) for an intermediate runner. */
const PEAK_HOURS: Record<TrailCategory, number> = { XS: 5, S: 6.5, M: 8, L: 10, XL: 12, XXL: 14 }
const LEVEL_VOLUME_FACTOR: Record<ExperienceLevel, number> = {
  BEGINNER: 0.75,
  INTERMEDIATE: 1,
  ADVANCED: 1.2,
  EXPERT: 1.4,
}
/** Maximum long run duration (min). */
const MAX_LONG_RUN_MIN: Record<TrailCategory, number> = { XS: 110, S: 180, M: 240, L: 300, XL: 360, XXL: 420 }
const TAPER_WEEKS: Record<TrailCategory, number> = { XS: 1, S: 1, M: 2, L: 2, XL: 3, XXL: 3 }
const TAPER_FACTORS: Record<number, number[]> = { 1: [0.6], 2: [0.75, 0.58], 3: [0.85, 0.72, 0.58] }
const RECOVERY_FACTOR = 0.65
const RACE_WEEK_FACTOR = 0.3
const MIN_WEEKS = 4
/** Fewest runs in a week, whatever the time budget. */
const MIN_WEEKLY_RUNS = 3

const QUALITY_TYPES: SessionType[] = ['HILL_REPEATS', 'UPHILL_THRESHOLD', 'HIKE_RUN', 'DOWNHILL', 'FARTLEK']
const FIXED_DURATION: Partial<Record<SessionType, number>> = {
  HILL_REPEATS: 55,
  UPHILL_THRESHOLD: 70,
  HIKE_RUN: 80,
  DOWNHILL: 55,
  FARTLEK: 50,
  RECOVERY: 35,
}

const PHASE_FOCUS: Record<TrainingPhase, string> = {
  BASE: 'Construire le moteur aérobie, renforcer les structures (tendons, chevilles).',
  BUILD: 'Seuil en montée, force excentrique et montée en volume.',
  SPECIFIC: 'Reproduire les exigences de la course : D+, durée, nutrition, nuit.',
  TAPER: 'Réduire le volume, garder un peu d’intensité : arriver frais.',
  RACE: 'Repos actif, sommeil, charge glucidique les 2 derniers jours.',
}

/** Data shared by all the plan's weeks. */
interface PlanContext {
  request: PlanRequest
  category: TrailCategory
  raceDurationH: number
  speedKme: number
  verticalRatio: number
  simulationWeek?: number
}

interface WeekSkeleton {
  index: number
  startDate: IsoDate
  phase: TrainingPhase
  isRecovery: boolean
  hours: number
  /** Progress through the phase (0 → 1). */
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
  const speedKme = request.trainingSpeedKme ?? TRAINING_SPEED_KME[profile.level]
  const skeleton = buildSkeleton(start, totalWeeks, category, profile, goal, speedKme)
  const ctx: PlanContext = {
    request,
    category,
    raceDurationH: estimateRaceDurationH(goal, profile.level),
    speedKme,
    verticalRatio: effectiveVerticalRatio(goal, profile),
    simulationWeek: pickSimulationWeek(skeleton),
  }

  // The day before the race stays free, even when it falls in the previous week (race on a Monday).
  const dayBeforeRace = addDays(goal.raceDate, -1)
  const sessions: PlannedSession[] = []
  const weeks: PlanWeek[] = skeleton.map((week) => {
    const weekSessions = buildWeekSessions(week, ctx).filter((s) => s.date >= today && (s.type === 'RACE' || s.date < dayBeforeRace))
    sessions.push(...weekSessions)
    const runs = weekSessions.filter((s) => s.sport === 'RUN' && s.type !== 'RACE')
    return {
      index: week.index,
      startDate: week.startDate,
      phase: week.phase,
      isRecovery: week.isRecovery,
      targetHours: round1(
        weekSessions.filter((s) => s.sport !== 'STRENGTH' && s.type !== 'RACE').reduce((sum, s) => sum + s.durationMin, 0) / 60,
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
  if (profile.terrain === 'FLAT' && verticalRatio(goal) > 40) {
    warnings.push(
      'Course très verticale et terrain plat : planifie quelques week-ends choc en montagne et exploite escaliers et tapis incliné.',
    )
  }
  if ((goal.maxAltitudeM ?? 0) >= 2_000) {
    warnings.push('Passages au-dessus de 2 000 m : si possible, arrive quelques jours avant pour t’acclimater.')
  }
  if (profile.level === 'BEGINNER' && (category === 'XL' || category === 'XXL')) {
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
  speedKme: number,
): WeekSkeleton[] {
  // A compressed build-up keeps most of its weeks for training: the taper takes a third of them at most.
  const taper = Math.min(TAPER_WEEKS[category], Math.max(Math.floor((totalWeeks - 1) / 3), 1))
  const buildWeeks = totalWeeks - 1 - taper
  const baseWeeks = Math.max(1, Math.round(buildWeeks * 0.4))
  const buildPhaseWeeks = Math.max(1, Math.round(buildWeeks * 0.33))
  const specificWeeks = Math.max(buildWeeks - baseWeeks - buildPhaseWeeks, 1)

  const phases: TrainingPhase[] = [
    ...Array<TrainingPhase>(baseWeeks).fill('BASE'),
    ...Array<TrainingPhase>(buildPhaseWeeks).fill('BUILD'),
    ...Array<TrainingPhase>(specificWeeks).fill('SPECIFIC'),
  ].slice(0, buildWeeks)

  const peak = Math.min(PEAK_HOURS[category] * LEVEL_VOLUME_FACTOR[profile.level], profile.maxWeeklyHours)
  const currentHours = kmEffort(profile.currentWeeklyKm, profile.currentWeeklyElevationM) / speedKme
  const startHours = Math.min(clamp(currentHours * 1.05, peak * 0.45, peak * 0.85), peak)

  // 3:1 cycle — every 4th build week is lighter, except right before the taper.
  const isRecovery = phases.map((_, i) => (i + 1) % 4 === 0 && i < buildWeeks - 1)
  const loadingWeeks = isRecovery.filter((r) => !r).length
  const rampLength = Math.max(loadingWeeks * 0.85, 1)

  const weeks: WeekSkeleton[] = []
  let loadingIndex = 0
  let previousHours = startHours
  let reachedHours = startHours
  for (let i = 0; i < buildWeeks; i++) {
    const phase = phases[i]!
    let hours: number
    if (isRecovery[i]) {
      hours = previousHours * RECOVERY_FACTOR
    } else {
      hours = startHours + (peak - startHours) * Math.min(1, loadingIndex / rampLength)
      loadingIndex++
      previousHours = hours
      reachedHours = Math.max(reachedHours, hours)
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

  // A short build-up may never reach the peak: the taper cuts from the volume actually reached.
  const taperFactors = TAPER_FACTORS[taper]!
  taperFactors.forEach((factor, t) => {
    const index = buildWeeks + t
    weeks.push({
      index,
      startDate: addDays(start, index * 7),
      phase: 'TAPER',
      isRecovery: false,
      hours: reachedHours * factor,
      progress: taperFactors.length > 1 ? t / (taperFactors.length - 1) : 1,
    })
  })

  weeks.push({
    index: totalWeeks - 1,
    startDate: startOfWeek(goal.raceDate),
    phase: 'RACE',
    isRecovery: false,
    hours: reachedHours * RACE_WEEK_FACTOR,
    progress: 1,
  })
  return weeks
}

function runTypesFor(week: WeekSkeleton, goal: RaceGoal, category: TrailCategory, isSimulationWeek: boolean): SessionType[] {
  const steep = goal.polesAllowed || verticalRatio(goal) >= 40
  const ultra = category === 'L' || category === 'XL' || category === 'XXL'
  if (week.isRecovery) return ['LONG_RUN', 'ENDURANCE', 'RECOVERY', 'ENDURANCE', 'FARTLEK', 'RECOVERY']
  switch (week.phase) {
    case 'BASE':
      return ['LONG_RUN', 'HILL_REPEATS', 'ENDURANCE', 'FARTLEK', 'ENDURANCE', 'RECOVERY']
    case 'BUILD':
      return [
        'LONG_RUN',
        'UPHILL_THRESHOLD',
        'ENDURANCE',
        week.index % 2 === 0 && steep ? 'HIKE_RUN' : 'DOWNHILL',
        'ENDURANCE',
        'HILL_REPEATS',
      ]
    case 'SPECIFIC':
      return [
        isSimulationWeek ? 'SIMULATION' : 'LONG_RUN',
        ultra ? 'BACK_TO_BACK' : 'ENDURANCE',
        'UPHILL_THRESHOLD',
        steep ? 'HIKE_RUN' : 'DOWNHILL',
        'ENDURANCE',
        steep ? 'DOWNHILL' : 'ENDURANCE',
      ]
    case 'TAPER':
      return ['LONG_RUN', 'HILL_REPEATS', 'ENDURANCE', 'ENDURANCE', 'RECOVERY', 'ENDURANCE']
    case 'RACE':
      return ['ENDURANCE', 'RECOVERY', 'ENDURANCE']
  }
}

function buildWeekSessions(week: WeekSkeleton, ctx: PlanContext): PlannedSession[] {
  const { goal, profile, planId } = ctx.request
  const days = [...profile.availableDays].sort((a, b) => a - b)
  const raceDay = week.phase === 'RACE' ? weekday(goal.raceDate) : undefined

  let runCount = Math.min(RUNNING_SESSIONS_BY_LEVEL[profile.level], days.length)
  if (week.isRecovery) runCount = Math.max(MIN_WEEKLY_RUNS, runCount - 1)
  if (week.phase === 'RACE') runCount = Math.min(runCount, MIN_WEEKLY_RUNS)
  let runTypes = runTypesFor(week, goal, ctx.category, ctx.simulationWeek === week.index).slice(0, runCount)

  // Volume split: cycling takes ~20 % of the hours if enabled.
  const cycling = profile.crossTraining.cycling && week.phase !== 'RACE'
  const totalMin = week.hours * 60
  const runMin = cycling ? totalMin * 0.8 : totalMin
  let durations = allocateDurations(runTypes, runMin, ctx.category, profile.level, week)
  // A small budget cannot hold every run at its minimum length: the lowest-priority runs (listed last) go first.
  const allocatedMin = () => [...durations.values()].flat().reduce((sum, min) => sum + min, 0)
  while (runTypes.length > MIN_WEEKLY_RUNS && allocatedMin() > runMin * 1.05) {
    runTypes = runTypes.slice(0, -1)
    durations = allocateDurations(runTypes, runMin, ctx.category, profile.level, week)
  }

  // Race week: nothing on or after race day, and the day before stays free.
  const runDays = raceDay === undefined ? days : days.filter((d) => d < raceDay - 1)
  const placement = placeRuns(runTypes, runDays, profile.longRunDay)

  const sessions: DraftSession[] = placement.map(({ type, day }) =>
    createSession(type, addDays(week.startDate, day), durations.get(type)?.shift() ?? 45, week, ctx),
  )
  if (cycling) sessions.push(...placeCycling(week, sessions, totalMin - runMin, ctx))
  if (profile.crossTraining.strength) sessions.push(...placeStrength(week, sessions, ctx))
  if (week.phase === 'RACE') {
    sessions.push(createSession('RACE', goal.raceDate, Math.round(ctx.raceDurationH * 60), week, ctx))
  }

  return sessions
    .sort((a, b) => a.date.localeCompare(b.date) || SPORT_ORDER[a.sport] - SPORT_ORDER[b.sport])
    .map((s, n) => ({ ...s, id: `${planId}-w${week.index}-${n}` }))
}

const SPORT_ORDER = { RUN: 0, BIKE: 1, STRENGTH: 2 } as const

type DraftSession = Omit<PlannedSession, 'id'>

function pickSimulationWeek(skeleton: WeekSkeleton[]): number | undefined {
  const loading = skeleton.filter((w) => w.phase === 'SPECIFIC' && !w.isRecovery)
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
  const maxLong = MAX_LONG_RUN_MIN[category] * (level === 'BEGINNER' ? 0.85 : 1)
  const hasBackToBack = types.includes('BACK_TO_BACK')
  const longShare = week.phase === 'RACE' ? 0 : hasBackToBack ? 0.28 : 0.35
  const durations = new Map<SessionType, number[]>()
  const push = (type: SessionType, min: number) => durations.set(type, [...(durations.get(type) ?? []), roundTo(min, 5)])

  let remaining = runMin
  const longMin = clamp(runMin * longShare, 60, maxLong)
  for (const type of types) {
    if (type === 'LONG_RUN') push(type, longMin)
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
  // An easy run never outlasts the week's long run (recovery weeks keep their shape).
  const easyMin = easy.length > 0 ? clamp(remaining / easy.length, 35, Math.min(90, longMin)) : 0
  easy.forEach((t) => push(t, week.phase === 'RACE' ? 35 : easyMin))
  remaining -= easyMin * easy.length

  // Volume not absorbed by easy runs: it lengthens the long run, then the back-to-back (not when unloading).
  if (remaining > 0 && (week.phase === 'BASE' || week.phase === 'BUILD' || week.phase === 'SPECIFIC') && !week.isRecovery) {
    const extend = (type: SessionType, cap: number) => {
      const list = durations.get(type)
      if (!list?.length || remaining <= 0) return
      const extra = Math.max(Math.min(remaining, cap - list[0]!), 0)
      list[0] = roundTo(list[0]! + extra, 5)
      remaining -= extra
    }
    extend('LONG_RUN', maxLong)
    extend('SIMULATION', maxLong * 1.1)
    extend('BACK_TO_BACK', (durations.get('LONG_RUN')?.[0] ?? durations.get('SIMULATION')?.[0] ?? 0) * 0.6)
  }
  return durations
}

interface Placement {
  type: SessionType
  day: number
}

/** Circular distance between two days (the next week starts over). */
function dayDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 7 - d)
}

function placeRuns(types: SessionType[], days: number[], longRunDay: number): Placement[] {
  const free = new Set(days)
  const placed: Placement[] = []
  const take = (type: SessionType, day: number) => {
    free.delete(day)
    placed.push({ type, day })
  }

  const longType = types.find((t) => t === 'LONG_RUN' || t === 'SIMULATION')
  const longDay = free.has(longRunDay) ? longRunDay : days.at(-1)!
  if (longType) take(longType, longDay)

  if (types.includes('BACK_TO_BACK')) {
    // Same weekend first; the Monday after a Sunday long run only as a last resort.
    const candidates = [longDay + 1, longDay - 1].filter((d) => d >= 0 && d <= 6).concat((longDay + 1) % 7, (longDay + 6) % 7)
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

  const easyTypes = types.filter((t) => t === 'ENDURANCE' || t === 'RECOVERY')
  for (const type of easyTypes) {
    if (free.size === 0) break
    const dayAfterLong = (longDay + 1) % 7
    const day = type === 'RECOVERY' && free.has(dayAfterLong) ? dayAfterLong : [...free][0]!
    take(type, day)
  }
  return placed
}

function placeCycling(week: WeekSkeleton, existing: DraftSession[], bikeMin: number, ctx: PlanContext): DraftSession[] {
  const { profile } = ctx.request
  const count = profile.crossTraining.cyclingSessionsPerWeek
  const usedDays = new Set(existing.map((s) => weekday(s.date)))
  const freeDays = profile.availableDays.filter((d) => !usedDays.has(d))
  const result: DraftSession[] = []

  for (let n = 0; n < count; n++) {
    const type: SessionType =
      (week.phase === 'BUILD' || week.phase === 'SPECIFIC') && !week.isRecovery && n === 0 ? 'BIKE_STRENGTH' : 'BIKE_ENDURANCE'
    const duration = clamp(roundTo(bikeMin / count, 5), 30, 150)
    let day = freeDays.shift()
    if (day === undefined) {
      // No free day: cycling replaces an easy endurance run (less impact).
      const runs = existing.filter((s) => s.sport === 'RUN')
      const swap = existing.find((s) => s.type === 'ENDURANCE')
      if (!swap || runs.length <= MIN_WEEKLY_RUNS) break
      existing.splice(existing.indexOf(swap), 1)
      day = weekday(swap.date)
    }
    result.push(createSession(type, addDays(week.startDate, day), duration, week, ctx))
  }
  return result
}

function placeStrength(week: WeekSkeleton, existing: DraftSession[], ctx: PlanContext): DraftSession[] {
  const { profile, goal } = ctx.request
  const tapering = week.phase === 'TAPER' || week.phase === 'RACE' || week.isRecovery
  const count = tapering ? 1 : profile.crossTraining.strengthSessionsPerWeek
  const routines = pickRoutines(ctx.request.routines, week, count)
  if (routines.length === 0) return []

  const hard = new Set(existing.filter((s) => s.keySession || s.type === 'BIKE_STRENGTH').map((s) => weekday(s.date)))
  const dayBeforeLong = (profile.longRunDay + 6) % 7
  const lastAllowed = week.phase === 'RACE' ? weekday(goal.raceDate) - 4 : 6
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
    const session = createSession('STRENGTH', addDays(week.startDate, day), routine.durationMin, week, ctx)
    return { ...session, title: routine.name, routineId: routine.id }
  })
}

function pickRoutines(routines: RoutineSummary[], week: WeekSkeleton, count: number): RoutineSummary[] {
  const eligible = routines.filter((r) => r.phases.includes(week.phase))
  if (eligible.length === 0) return []
  if (week.isRecovery) {
    return [eligible.reduce((a, b) => (a.durationMin <= b.durationMin ? a : b))]
  }
  // The most complete routines first, alternating from one week to the next.
  const sorted = [...eligible].sort((a, b) => b.durationMin - a.durationMin || a.id.localeCompare(b.id))
  return Array.from({ length: Math.min(count, sorted.length) }, (_, i) => sorted[(week.index + i) % sorted.length]!)
}

/** Realistic climbing/km ratio in training: capped by the available terrain. */
function effectiveVerticalRatio(goal: RaceGoal, profile: AthleteProfile): number {
  const cap = profile.terrain === 'FLAT' ? 15 : profile.terrain === 'HILLS' ? 35 : Infinity
  return Math.min(verticalRatio(goal), cap)
}

function createSession(type: SessionType, date: IsoDate, durationMin: number, week: WeekSkeleton, ctx: PlanContext): DraftSession {
  const { goal, profile } = ctx.request
  const content = describeSession(type, {
    durationMin,
    phase: week.phase,
    progress: week.progress,
    goal,
    terrain: profile.terrain,
    raceDurationH: ctx.raceDurationH,
  })
  const sport = SESSION_SPORT[type]
  const base: DraftSession = {
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
  if (type === 'RACE') return { ...base, distanceKm: goal.distanceKm, elevationGainM: goal.elevationGainM }

  const sessionRatio = ctx.verticalRatio * content.verticalShare
  const effort = (durationMin / 60) * ctx.speedKme * (content.zone >= 4 ? 1.05 : 1)
  const distanceKm = effort / (1 + sessionRatio / 100)
  return {
    ...base,
    distanceKm: round1(distanceKm),
    elevationGainM: roundTo(distanceKm * sessionRatio, 10),
  }
}
