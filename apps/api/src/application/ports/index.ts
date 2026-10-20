/**
 * Hexagon ports: the domain and the use cases depend only on these interfaces.
 * The adapters (SQLite, file parsers, Strava, clock…) live in `infrastructure/`.
 */
import type { DeviceSession, User } from '../../domain/account/account'
import type { Activity, ActivitySample, ImportedActivity } from '../../domain/activity/activity'
import type { AthleteProfile } from '../../domain/athlete/athlete-profile'
import type { RaceGoal } from '../../domain/goal/race-goal'
import type { Recipe } from '../../domain/nutrition/recipe'
import type { PlannedSession, TrainingPlan } from '../../domain/plan/training-plan'
import type { WorkoutDefinition } from '../../domain/plan/workout-definition'
import type { RaceCourse, TrackPoint } from '../../domain/race-course/race-course'
import type { CheckIn } from '../../domain/wellness/check-in'
import type { NotificationSettings, NotificationState, PushMessage } from '../../domain/notifications/notification'
import type { Exercise } from '../../domain/strength/exercise'
import type { StrengthRoutine } from '../../domain/strength/routine'

export interface UserRepository {
  findByEmail(email: string): User | undefined
  findById(id: string): User | undefined
  save(user: User): void
}

export interface SessionRepository {
  findByTokenHash(tokenHash: string): DeviceSession | undefined
  listByUser(userId: string): DeviceSession[]
  save(session: DeviceSession): void
  touch(id: string, lastSeenAt: string): void
  delete(userId: string, id: string): boolean
  deleteExpired(now: string): void
}

export interface ProfileRepository {
  get(userId: string): AthleteProfile | undefined
  save(userId: string, profile: AthleteProfile): void
}

export interface GoalRepository {
  get(userId: string): RaceGoal | undefined
  save(userId: string, goal: RaceGoal): void
}

export interface PlanRepository {
  get(userId: string): TrainingPlan | undefined
  /** Replaces the user's existing plan. */
  save(userId: string, plan: TrainingPlan): void
  updateSession(userId: string, session: PlannedSession): void
}

export interface ActivityRepository {
  list(userId: string, limit?: number): Activity[]
  get(userId: string, id: string): Activity | undefined
  existsByExternalId(userId: string, externalId: string): boolean
  findByExternalId(userId: string, externalId: string): Activity | undefined
  save(activity: Activity): void
  delete(userId: string, id: string): boolean
}

export interface RaceCourseRepository {
  get(userId: string): RaceCourse | undefined
  save(userId: string, course: RaceCourse): void
  delete(userId: string): void
}

export interface CheckInRepository {
  /** Check-ins from `from` inclusive, sorted by ascending date. */
  listSince(userId: string, from: string): CheckIn[]
  save(userId: string, checkIn: CheckIn): void
}

export interface ContentCatalog {
  exercises(): Exercise[]
  routines(): StrengthRoutine[]
  recipes(): Recipe[]
}

export interface ActivityFileParser {
  /** Supported extension, lowercase (`.fit`). */
  readonly extension: string
  parse(content: Buffer, filename: string): Promise<ImportedActivity>
}

/** Official course read from a file (the organiser's GPX). */
export interface CourseFile {
  name: string
  track: TrackPoint[]
  waypoints: Array<{ name: string; lat: number; lon: number }>
}

export interface CourseFileParser {
  parse(content: Buffer): CourseFile
}

export interface WorkoutEncoder {
  readonly extension: string
  encode(workout: WorkoutDefinition): Buffer
}

/** Drops files onto the watch (e.g. the `GARMIN/NewFiles` folder mounted over USB). */
export interface WatchOutbox {
  isConfigured(): boolean
  deliver(filename: string, content: Buffer): Promise<void>
}

export interface IntegrationTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  /** Account id on the provider side: links its notifications (webhook) to the user. */
  athleteId?: string
  athleteName?: string
  lastSyncAt?: string
}

export interface IntegrationStore {
  get(userId: string, provider: string): IntegrationTokens | undefined
  save(userId: string, provider: string, tokens: IntegrationTokens): void
  delete(userId: string, provider: string): void
  connectedUsers(provider: string): string[]
  findUserByAthleteId(provider: string, athleteId: string): string | undefined
}

/** Remote activity provider (Strava today, Garmin if its API reopens). */
export interface ActivityProvider {
  readonly name: string
  isConfigured(): boolean
  authorizationUrl(state: string): string
  exchangeCode(code: string): Promise<IntegrationTokens>
  refresh(tokens: IntegrationTokens): Promise<IntegrationTokens>
  fetchSince(tokens: IntegrationTokens, since: Date): Promise<ImportedActivity[]>
  /**
   * Detailed track of an activity (elevation, HR…), fetched separately from providers
   * that do not include it in the list. Empty array if the activity has none.
   */
  fetchSamples?(tokens: IntegrationTokens, externalId: string): Promise<ActivitySample[]>
}

/** Provider quota reached: retried on the next sync. */
export class RateLimitedError extends Error {
  constructor(provider: string) {
    super(`Quota d'appels ${provider} atteint`)
    this.name = 'RateLimitedError'
  }
}

export interface TimeZoneProvider {
  timeZoneOf(userId: string): string
}

/** Notified of each new activity (analysis and notification after an automatic sync). */
export interface ActivityImportListener {
  activityImported(userId: string, activity: Activity, automatic: boolean): void
}

export interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface StoredPushSubscription extends PushSubscription {
  userId: string
  deviceLabel: string
  createdAt: string
}

export interface PushSubscriptionRepository {
  save(subscription: StoredPushSubscription): void
  listByUser(userId: string): StoredPushSubscription[]
  usersWithSubscriptions(): string[]
  delete(endpoint: string): void
}

export interface NotificationSettingsRepository {
  get(userId: string): { settings: NotificationSettings; state: NotificationState } | undefined
  save(userId: string, settings: NotificationSettings, state: NotificationState): void
}

/** Sends a Web Push notification; `GONE`: the subscription no longer exists in the browser. */
export interface PushSender {
  publicKey(): string
  send(subscription: PushSubscription, message: PushMessage): Promise<'SENT' | 'GONE'>
}

export interface CalendarFeedRepository {
  tokenOf(userId: string): string | undefined
  userOf(token: string): string | undefined
  save(userId: string, token: string): void
}

export interface CalendarFeed {
  name: string
  sessions: PlannedSession[]
  goal?: RaceGoal
  /** Kairn's public URL, for links to each session. */
  baseUrl: string
  generatedAt: Date
}

export interface CalendarEncoder {
  encode(feed: CalendarFeed): string
}

export interface PasswordHasher {
  hash(password: string): Promise<string>
  verify(password: string, hash: string): Promise<boolean>
}

export interface TokenService {
  /** Opaque random token for the cookie. */
  generate(): string
  /** Deterministic digest, the only value persisted. */
  digest(token: string): string
}

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  next(): string
}
