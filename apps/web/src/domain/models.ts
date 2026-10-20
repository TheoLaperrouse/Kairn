/**
 * Front-end models: a mirror of the JSON contracts exposed by the API.
 * The front end has its own domain (display, kinematics, formatting) and does not depend on server code.
 */

export type IsoDate = string
export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'
export type TerrainAccess = 'MOUNTAINS' | 'HILLS' | 'FLAT'
export type TrainingPhase = 'BASE' | 'BUILD' | 'SPECIFIC' | 'TAPER' | 'RACE'
export type TrailCategory = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
export type Sport = 'RUN' | 'BIKE' | 'STRENGTH'
export type Zone = 1 | 2 | 3 | 4 | 5
export type SessionStatus = 'PLANNED' | 'DONE' | 'SKIPPED'
export type SessionType =
  | 'ENDURANCE'
  | 'RECOVERY'
  | 'LONG_RUN'
  | 'BACK_TO_BACK'
  | 'SIMULATION'
  | 'HILL_REPEATS'
  | 'UPHILL_THRESHOLD'
  | 'HIKE_RUN'
  | 'DOWNHILL'
  | 'FARTLEK'
  | 'STRENGTH'
  | 'BIKE_ENDURANCE'
  | 'BIKE_STRENGTH'
  | 'RACE'

export interface User {
  id: string
  email: string
  displayName: string
}

export interface Device {
  id: string
  deviceLabel: string
  createdAt: string
  lastSeenAt: string
  current: boolean
}

export interface AthleteProfile {
  name: string
  level: ExperienceLevel
  weightKg?: number
  hrMax?: number
  hrRest?: number
  currentWeeklyKm: number
  currentWeeklyElevationM: number
  availableDays: number[]
  longRunDay: number
  maxWeeklyHours: number
  terrain: TerrainAccess
  crossTraining: {
    cycling: boolean
    cyclingSessionsPerWeek: 1 | 2
    strength: boolean
    strengthSessionsPerWeek: 1 | 2
  }
}

export interface RaceGoal {
  id?: string
  name: string
  raceDate: IsoDate
  distanceKm: number
  elevationGainM: number
  technicity: 1 | 2 | 3 | 4 | 5
  maxAltitudeM?: number
  polesAllowed: boolean
  nightSections: boolean
  targetTimeH?: number
  presetId?: string
}

export interface RacePreset extends Omit<RaceGoal, 'id' | 'raceDate' | 'targetTimeH'> {
  presetId: string
  location: string
  usualMonth: number
  highlights: string
}

export interface WorkoutStep {
  kind: 'WARMUP' | 'EFFORT' | 'RECOVERY' | 'COOLDOWN' | 'CONTINUOUS'
  label: string
  durationMin: number
  repeat?: number
  zone: Zone
  terrain?: string
}

export interface PlannedSession {
  id: string
  weekIndex: number
  date: IsoDate
  type: SessionType
  sport: Sport
  title: string
  objective: string
  durationMin: number
  distanceKm?: number
  elevationGainM?: number
  zone: Zone
  keySession: boolean
  steps: WorkoutStep[]
  tips: string[]
  routineId?: string
  status: SessionStatus
  activityId?: string
  notes?: string
  adjustment?: string
  originalDate?: IsoDate
  /** Role of the session in the training block. */
  purpose?: string
}

export interface PlanWeek {
  index: number
  startDate: IsoDate
  phase: TrainingPhase
  isRecovery: boolean
  targetHours: number
  targetKm: number
  targetElevationM: number
  focus: string
}

export interface TrainingPlan {
  id: string
  goalId: string
  createdAt: string
  startDate: IsoDate
  weeks: PlanWeek[]
  sessions: PlannedSession[]
  warnings: string[]
  adjustments?: PlanAdjustment[]
}

export interface ProfilePoint {
  distanceKm: number
  altitudeM: number
}

export interface Activity {
  id: string
  source: 'FIT' | 'GPX' | 'TCX' | 'STRAVA' | 'GARMIN_FOLDER' | 'MANUAL'
  sport: Sport
  name: string
  startTime: string
  /** Start day in the runner's time zone (missing on older activities). */
  localDate?: IsoDate
  durationSec: number
  distanceKm: number
  elevationGainM: number
  avgHeartRate?: number
  maxHeartRate?: number
  profile: ProfilePoint[]
  /** Detailed trace, only present when an activity is loaded on its own. */
  samples?: ActivitySample[]
  plannedSessionId?: string
}

/** Trace sample: seconds since start, km, altitude, heart rate. */
export interface ActivitySample {
  t: number
  d: number
  alt?: number
  hr?: number
}

export interface Climb {
  startKm: number
  endKm: number
  startAltitudeM: number
  endAltitudeM: number
  elevationM: number
  durationSec: number
  gradePct: number
  verticalSpeed: number
  avgHeartRate?: number
}

export type Verdict = 'ON_TARGET' | 'TOO_HARD' | 'TOO_EASY' | 'CUT_SHORT' | 'EXTENDED' | 'UNPLANNED'
export interface ActivityVerdict {
  verdict: Verdict
  score?: number
}

export type InsightTone = 'POSITIVE' | 'ATTENTION' | 'INFO'
export type InsightTopic = 'INTENSITY' | 'DURATION' | 'ELEVATION' | 'UPHILL' | 'DOWNHILL' | 'ENDURANCE' | 'NUTRITION' | 'DATA' | 'LOAD'

export interface Insight {
  tone: InsightTone
  topic: InsightTopic
  title: string
  text: string
}

export type TimeInZones = Record<Zone, number>

export interface WorkoutAnalysis {
  activityId: string
  hasDetail: boolean
  zones?: { method: 'RESERVE' | 'MAX'; bounds: [number, number, number, number]; seconds: TimeInZones }
  climbs: Climb[]
  descents: Climb[]
  ascentVam?: number
  bestClimb?: Climb
  descentSpeed?: number
  vamBaseline?: number
  vamCurve: Partial<Record<VamDuration, VamEffort>>
  vamRecords: Array<{ minutes: VamDuration; vam: number; previous: number }>
  decouplingPct?: number
  load: number
  plannedLoad?: number
  hrMaxSuggestion?: { observed: number; current?: number }
  comparison?: {
    sessionId: string
    sessionTitle: string
    sessionType: SessionType
    keySession: boolean
    targetZone: Zone
    plannedDurationMin: number
    actualDurationMin: number
    plannedDistanceKm?: number
    plannedElevationM?: number
    plannedEffortMin?: number
    effortMin?: number
  }
  verdict: Verdict
  score?: number
  headline: string
  insights: Insight[]
  nextStep?: { text: string; sessionId?: string; suggestLighten: boolean }
}

export type VamDuration = 5 | 10 | 20 | 30

export interface VamEffort {
  minutes: VamDuration
  vam: number
  elevationM: number
  startKm: number
  endKm: number
}

export interface VamMark {
  vam: number
  activityId: string
  activityName: string
  date: IsoDate
}

export interface VamProgress {
  durations: VamDuration[]
  weeks: Array<{ weekStart: IsoDate; best: Partial<Record<VamDuration, VamMark>> }>
  records: Partial<Record<VamDuration, VamMark>>
  trend: Partial<Record<VamDuration, { recent?: number; previous?: number; deltaPct?: number }>>
}

export interface WeekInfo {
  index: number
  phase: TrainingPhase
  phaseLabel: string
  isRecovery: boolean
  focus: string
}

export interface WeekVolumeTotals {
  hours: number
  km: number
  elevationM: number
}

export interface WeeklySummary {
  weekStart: IsoDate
  weekEnd: IsoDate
  inProgress: boolean
  week?: WeekInfo
  goalName?: string
  daysToRace?: number
  totals: WeekVolumeTotals & { activities: number; load: number }
  targets?: WeekVolumeTotals
  sessions: { planned: number; done: number; skipped: number; missed: number }
  keySessions: Array<{ id: string; title: string; date: IsoDate; status: SessionStatus; verdict?: Verdict; activityId?: string }>
  zones?: TimeInZones
  verdicts: Partial<Record<Verdict, number>>
  form: { fitness: number; fitnessChange: number; freshness: number; reliable: boolean }
  readiness?: { average: number; days: number; redDays: number }
  highlights: Array<{ label: string; value: string; detail?: string; activityId?: string }>
  insights: Insight[]
  nextWeek?: WeekInfo & { targets: WeekVolumeTotals; keySessions: Array<{ id: string; title: string; date: IsoDate }> }
  headline: string
  activities: Array<{
    id: string
    name: string
    startTime: string
    localDate: IsoDate
    sport: Sport
    durationSec: number
    distanceKm: number
    elevationGainM: number
    verdict: Verdict
    headline: string
  }>
}

export interface NotificationSettings {
  timeZone: string
  morning: { enabled: boolean; time: string }
  weekly: { enabled: boolean; time: string }
  analysis: { enabled: boolean }
  checkIn: { enabled: boolean; time: string }
}

export interface NotificationStatus {
  publicKey: string
  settings: NotificationSettings
  devices: Array<{ endpoint: string; deviceLabel: string; createdAt: string }>
}

export interface PushSubscriptionPayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type ImportOutcome =
  | { status: 'IMPORTED'; activity: Activity; matchedSessionTitle?: string }
  | { status: 'DUPLICATE'; filename: string }
  | { status: 'FAILED'; filename: string; reason: string }

export interface ProviderStatus {
  provider: string
  configured: boolean
  connected: boolean
  athleteName?: string
  lastSyncAt?: string
}

export interface LoadPoint {
  date: IsoDate
  load: number
  fitness: number
  fatigue: number
  form: number
  projected: boolean
}

export interface WeekVolume {
  weekIndex: number
  startDate: IsoDate
  phase: TrainingPhase
  isRecovery: boolean
  plannedHours: number
  actualHours: number
  plannedKm: number
  actualKm: number
  plannedElevationM: number
  actualElevationM: number
}

export interface Dashboard {
  goal: {
    name: string
    raceDate: IsoDate
    daysToRace: number
    category: TrailCategory
    categoryLabel: string
    kmEffort: number
    estimatedDurationH: number
    distanceKm: number
    elevationGainM: number
  }
  currentWeek?: PlanWeek
  weekSessions: PlannedSession[]
  nextKeySession?: PlannedSession
  volumes: WeekVolume[]
  load: LoadPoint[]
  raceDayForm?: number
  adherence: { done: number; skipped: number; missed: number; total: number }
  warnings: string[]
}

export type ExerciseCategory = 'CORE' | 'STRENGTH' | 'ECCENTRIC' | 'PLYOMETRICS' | 'PROPRIOCEPTION' | 'MOBILITY'

export interface Pose {
  torso: number
  head?: number
  nearUpperArm: number
  nearForearm: number
  farUpperArm: number
  farForearm: number
  nearThigh: number
  nearShin: number
  farThigh: number
  farShin: number
  /**
   * Absolute foot angle (same convention as hanging segments: 90 = flat, pointing forward,
   * < 90 = toes pointing down, e.g. 60 on tiptoe). Default: flat when the shin is near vertical,
   * in natural extension when the leg is in the air or horizontal.
   */
  nearFoot?: number
  farFoot?: number
  hipX?: number
  air?: number
  groundOffset?: number
}

export interface SceneProp {
  kind: 'BOX' | 'BENCH' | 'MAT' | 'BAND' | 'DUMBBELL' | 'CUSHION' | 'WALL'
  x: number
  width?: number
  height?: number
}

export interface Exercise {
  id: string
  name: string
  category: ExerciseCategory
  muscles: string[]
  equipment: string[]
  difficulty: 1 | 2 | 3
  description: string
  cues: string[]
  commonMistakes: string[]
  trailBenefit: string
  regression?: string
  progression?: string
  animation: {
    durationMs: number
    keyframes: Pose[]
    /** Instant (0 → 1) of each keyframe in the cycle; evenly spaced by default. */
    timing?: number[]
    /** Reps contained in one cycle (2 when the cycle shows both sides). Default: 1. */
    repsPerCycle?: number
    props?: SceneProp[]
  }
}

export interface RoutineBlock {
  exerciseId: string
  sets: number
  reps?: number
  durationSec?: number
  restSec: number
  tempo?: string
  perSide?: boolean
  notes?: string
}

export interface StrengthRoutine {
  id: string
  name: string
  phases: TrainingPhase[]
  durationMin: number
  focus: string
  description: string
  blocks: RoutineBlock[]
}

export interface RoutineDetail extends StrengthRoutine {
  exercises: Exercise[]
}

export type RecipeCategory = 'DAY_BEFORE' | 'BEFORE' | 'DURING' | 'DRINK' | 'AFTER'

export interface Recipe {
  id: string
  name: string
  category: RecipeCategory
  moment: string
  prepMinutes: number
  servings: number
  servingLabel: string
  ingredients: Array<{ name: string; quantity: number; unit: string }>
  steps: string[]
  perServing: { kcal: number; carbsG: number; proteinG: number; fatG: number; sodiumMg: number }
  tags: string[]
  tip: string
  storage: string
  emoji: string
}

export interface FuelingInput {
  durationH: number
  temperatureC: number
  weightKg: number
  sweat: 'LOW' | 'MEDIUM' | 'HIGH'
  gut: 'NONE' | 'PARTIAL' | 'TRAINED'
}

export interface FuelingPlan {
  carbsPerHourG: number
  fluidPerHourMl: number
  sodiumPerHourMg: number
  caffeineMg: number
  totals: { carbsG: number; fluidL: number; sodiumMg: number }
  hours: Array<{ hour: number; carbsG: number; fluidMl: number; sodiumMg: number; suggestion: string }>
  advice: string[]
}

export type AdjustmentReason = 'MISSED_SESSION' | 'ILLNESS' | 'INJURY' | 'UNAVAILABLE' | 'FATIGUE'

export interface PlanAdjustment {
  id: string
  createdAt: string
  reason: AdjustmentReason
  summary: string
  details: string[]
}

export interface Unavailability {
  from: IsoDate
  to: IsoDate
  reason: 'ILLNESS' | 'INJURY' | 'UNAVAILABLE'
  crossTrainingOk: boolean
}

export type LightenMode = 'LIGHTEN' | 'REST'

export type Scale = 1 | 2 | 3 | 4 | 5

export interface CheckIn {
  date: IsoDate
  sleepHours: number
  sleepQuality: Scale
  soreness: Scale
  fatigue: Scale
  motivation: Scale
  stress: Scale
  restingHr?: number
  hrv?: number
  illnessSymptoms: boolean
  notes?: string
}

export type ReadinessLevel = 'GREEN' | 'ORANGE' | 'RED'

export interface Readiness {
  score: number
  level: ReadinessLevel
  factors: Array<{ label: string; impact: number }>
  message: string
  action: 'NONE' | 'LIGHTEN' | 'REST'
  alerts: string[]
}

export interface CheckInResult {
  checkIn: CheckIn
  readiness: Readiness
  affectedSessions: PlannedSession[]
}

export interface WellnessOverview {
  today?: CheckInResult
  history: Array<{ date: IsoDate; score: number; level: ReadinessLevel; restingHr?: number; hrv?: number }>
}

export interface CoursePoint {
  distanceKm: number
  altitudeM: number
}

export interface AidStation {
  name: string
  km: number
  cutoffH?: number
  major: boolean
}

export interface RaceCourseSettings {
  startTime: string
  temperatureC: number
  sweat: 'LOW' | 'MEDIUM' | 'HIGH'
  gut: 'NONE' | 'PARTIAL' | 'TRAINED'
  weightKg: number
}

export interface RaceCourse {
  name: string
  uploadedAt: string
  points: CoursePoint[]
  totalDistanceKm: number
  elevationGainM: number
  elevationLossM: number
  maxAltitudeM: number
  aidStations: AidStation[]
  settings: RaceCourseSettings
}

export interface CourseSegment {
  kind: 'UPHILL' | 'DOWNHILL' | 'FLAT'
  startKm: number
  endKm: number
  gainM: number
  lossM: number
  avgGradePct: number
  startElapsedH: number
  durationH: number
  key: boolean
  rehearsal?: ClimbRehearsal
}

/** A hill from the runner's own tracks matching a race climb or descent. */
export interface ClimbRehearsal {
  local: {
    activityId: string
    activityName: string
    date: string
    startKm: number
    endKm: number
    elevationM: number
    gradePct: number
    verticalSpeed: number
  }
  repetitions: number
  gradeGapPct: number
  estimatedDurationH: number
}

export interface Split {
  name: string
  km: number
  elapsedH: number
  clock: string
  day: number
  cutoffH?: number
  marginH?: number
  legDistanceKm: number
  legGainM: number
  legLossM: number
  legDurationH: number
  stopMin: number
  night: boolean
  nutrition: { carbsG: number; fluidMl: number; sodiumMg: number; carry: string[] }
}

export interface RacePlan {
  totalH: number
  movingH: number
  segments: CourseSegment[]
  splits: Split[]
  timeline: Array<{ km: number; elapsedH: number }>
  warnings: string[]
}

export interface RaceCourseView {
  course: RaceCourse
  plan: RacePlan
  goalMismatch?: { distanceKm: number; elevationGainM: number }
}

/** Day of an activity: the local day when known. */
export function activityDay(activity: Pick<Activity, 'startTime' | 'localDate'>): IsoDate {
  return activity.localDate ?? activity.startTime.slice(0, 10)
}
