import type { DatabaseSync } from 'node:sqlite'
import type {
  ActivityRepository,
  CalendarFeedRepository,
  CheckInRepository,
  NotificationSettingsRepository,
  PushSubscriptionRepository,
  StoredPushSubscription,
  RaceCourseRepository,
  GoalRepository,
  IntegrationStore,
  IntegrationTokens,
  PlanRepository,
  ProfileRepository,
  SessionRepository,
  UserRepository,
} from '../../application/ports'
import type { DeviceSession, User } from '../../domain/account/account'
import type { Activity } from '../../domain/activity/activity'
import type { AthleteProfile } from '../../domain/athlete/athlete-profile'
import type { RaceGoal } from '../../domain/goal/race-goal'
import type { PlannedSession, TrainingPlan } from '../../domain/plan/training-plan'
import type { RaceCourse } from '../../domain/race-course/race-course'
import type { CheckIn } from '../../domain/wellness/check-in'
import type { NotificationSettings, NotificationState } from '../../domain/notifications/notification'
import { transaction } from './database'

type Row = Record<string, unknown>

function parse<T>(row: Row | undefined): T | undefined {
  return row ? (JSON.parse(row.data as string) as T) : undefined
}

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseSync) {}

  findByEmail(email: string): User | undefined {
    return toUser(this.db.prepare('SELECT * FROM users WHERE email = ?').get(email))
  }

  findById(id: string): User | undefined {
    return toUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id))
  }

  save(user: User): void {
    this.db
      .prepare(
        `INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, password_hash = excluded.password_hash`,
      )
      .run(user.id, user.email, user.displayName, user.passwordHash, user.createdAt)
  }
}

function toUser(row: Row | undefined): User | undefined {
  if (!row) return undefined
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    passwordHash: row.password_hash as string,
    createdAt: row.created_at as string,
  }
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: DatabaseSync) {}

  findByTokenHash(tokenHash: string): DeviceSession | undefined {
    return toSession(this.db.prepare('SELECT * FROM device_sessions WHERE token_hash = ?').get(tokenHash))
  }

  listByUser(userId: string): DeviceSession[] {
    return this.db
      .prepare('SELECT * FROM device_sessions WHERE user_id = ?')
      .all(userId)
      .map((row) => toSession(row)!)
  }

  save(session: DeviceSession): void {
    this.db
      .prepare(
        `INSERT INTO device_sessions (id, user_id, token_hash, device_label, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.userId,
        session.tokenHash,
        session.deviceLabel,
        session.createdAt,
        session.lastSeenAt,
        session.expiresAt,
      )
  }

  touch(id: string, lastSeenAt: string): void {
    this.db.prepare('UPDATE device_sessions SET last_seen_at = ? WHERE id = ?').run(lastSeenAt, id)
  }

  delete(userId: string, id: string): boolean {
    return this.db.prepare('DELETE FROM device_sessions WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  }

  deleteExpired(now: string): void {
    this.db.prepare('DELETE FROM device_sessions WHERE expires_at <= ?').run(now)
  }
}

function toSession(row: Row | undefined): DeviceSession | undefined {
  if (!row) return undefined
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tokenHash: row.token_hash as string,
    deviceLabel: row.device_label as string,
    createdAt: row.created_at as string,
    lastSeenAt: row.last_seen_at as string,
    expiresAt: row.expires_at as string,
  }
}

/** Dépôt « un document JSON par utilisateur » pour le profil et l'objectif. */
class JsonDocumentRepository<T> {
  constructor(
    private readonly db: DatabaseSync,
    private readonly table: 'profiles' | 'goals' | 'race_courses',
  ) {}

  get(userId: string): T | undefined {
    return parse<T>(this.db.prepare(`SELECT data FROM ${this.table} WHERE user_id = ?`).get(userId))
  }

  save(userId: string, value: T): void {
    this.db
      .prepare(`INSERT INTO ${this.table} (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data`)
      .run(userId, JSON.stringify(value))
  }
}

export class SqliteProfileRepository extends JsonDocumentRepository<AthleteProfile> implements ProfileRepository {
  constructor(db: DatabaseSync) {
    super(db, 'profiles')
  }
}

export class SqliteGoalRepository extends JsonDocumentRepository<RaceGoal> implements GoalRepository {
  constructor(db: DatabaseSync) {
    super(db, 'goals')
  }
}

export class SqliteRaceCourseRepository extends JsonDocumentRepository<RaceCourse> implements RaceCourseRepository {
  constructor(private readonly database: DatabaseSync) {
    super(database, 'race_courses')
  }

  delete(userId: string): void {
    this.database.prepare('DELETE FROM race_courses WHERE user_id = ?').run(userId)
  }
}

export class SqliteCheckInRepository implements CheckInRepository {
  constructor(private readonly db: DatabaseSync) {}

  listSince(userId: string, from: string): CheckIn[] {
    return this.db
      .prepare('SELECT data FROM check_ins WHERE user_id = ? AND date >= ? ORDER BY date')
      .all(userId, from)
      .map((row) => parse<CheckIn>(row)!)
  }

  save(userId: string, checkIn: CheckIn): void {
    this.db
      .prepare('INSERT INTO check_ins (user_id, date, data) VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET data = excluded.data')
      .run(userId, checkIn.date, JSON.stringify(checkIn))
  }
}

/** Le plan est stocké en deux parties : l'en-tête (semaines, alertes) et une ligne par séance. */
export class SqlitePlanRepository implements PlanRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: string): TrainingPlan | undefined {
    const header = parse<Omit<TrainingPlan, 'sessions'>>(
      this.db.prepare('SELECT data FROM plans WHERE user_id = ?').get(userId),
    )
    if (!header) return undefined
    const sessions = this.db
      .prepare('SELECT data FROM planned_sessions WHERE user_id = ? ORDER BY date, rowid')
      .all(userId)
      .map((row) => parse<PlannedSession>(row)!)
    return { ...header, sessions }
  }

  save(userId: string, plan: TrainingPlan): void {
    const { sessions, ...header } = plan
    transaction(this.db, () => {
      this.db
        .prepare('INSERT INTO plans (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data')
        .run(userId, JSON.stringify(header))
      this.db.prepare('DELETE FROM planned_sessions WHERE user_id = ?').run(userId)
      const insert = this.db.prepare('INSERT INTO planned_sessions (id, user_id, date, data) VALUES (?, ?, ?, ?)')
      for (const session of sessions) insert.run(session.id, userId, session.date, JSON.stringify(session))
    })
  }

  updateSession(userId: string, session: PlannedSession): void {
    this.db
      .prepare('UPDATE planned_sessions SET data = ?, date = ? WHERE id = ? AND user_id = ?')
      .run(JSON.stringify(session), session.date, session.id, userId)
  }
}

export class SqliteActivityRepository implements ActivityRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(userId: string, limit = 10_000): Activity[] {
    return this.db
      .prepare('SELECT data FROM activities WHERE user_id = ? ORDER BY start_time DESC LIMIT ?')
      .all(userId, limit)
      .map((row) => parse<Activity>(row)!)
  }

  get(userId: string, id: string): Activity | undefined {
    return parse<Activity>(this.db.prepare('SELECT data FROM activities WHERE id = ? AND user_id = ?').get(id, userId))
  }

  findByExternalId(userId: string, externalId: string): Activity | undefined {
    return parse<Activity>(this.db.prepare('SELECT data FROM activities WHERE user_id = ? AND external_id = ?').get(userId, externalId))
  }

  existsByExternalId(userId: string, externalId: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM activities WHERE user_id = ? AND external_id = ?').get(userId, externalId))
  }

  save(activity: Activity): void {
    this.db
      .prepare(
        `INSERT INTO activities (id, user_id, external_id, start_time, data) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      .run(activity.id, activity.userId, activity.externalId, activity.startTime, JSON.stringify(activity))
  }

  delete(userId: string, id: string): boolean {
    return this.db.prepare('DELETE FROM activities WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  }
}

export class SqliteIntegrationStore implements IntegrationStore {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: string, provider: string): IntegrationTokens | undefined {
    return parse<IntegrationTokens>(
      this.db.prepare('SELECT data FROM integrations WHERE user_id = ? AND provider = ?').get(userId, provider),
    )
  }

  save(userId: string, provider: string, tokens: IntegrationTokens): void {
    this.db
      .prepare(
        `INSERT INTO integrations (user_id, provider, data) VALUES (?, ?, ?)
         ON CONFLICT(user_id, provider) DO UPDATE SET data = excluded.data`,
      )
      .run(userId, provider, JSON.stringify(tokens))
  }

  delete(userId: string, provider: string): void {
    this.db.prepare('DELETE FROM integrations WHERE user_id = ? AND provider = ?').run(userId, provider)
  }

  connectedUsers(provider: string): string[] {
    const rows = this.db.prepare('SELECT user_id FROM integrations WHERE provider = ?').all(provider) as { user_id: string }[]
    return rows.map((row) => row.user_id)
  }

  findUserByAthleteId(provider: string, athleteId: string): string | undefined {
    const row = this.db
      .prepare("SELECT user_id FROM integrations WHERE provider = ? AND json_extract(data, '$.athleteId') = ?")
      .get(provider, athleteId) as { user_id: string } | undefined
    return row?.user_id
  }
}

export class SqlitePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly db: DatabaseSync) {}

  /** Un même navigateur réabonné (ou passé à un autre compte) remplace l'abonnement existant. */
  save(subscription: StoredPushSubscription): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, user_id, data) VALUES (?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, data = excluded.data`,
      )
      .run(subscription.endpoint, subscription.userId, JSON.stringify(subscription))
  }

  listByUser(userId: string): StoredPushSubscription[] {
    return this.db
      .prepare('SELECT data FROM push_subscriptions WHERE user_id = ? ORDER BY rowid')
      .all(userId)
      .map((row) => parse<StoredPushSubscription>(row)!)
  }

  usersWithSubscriptions(): string[] {
    return (this.db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all() as { user_id: string }[]).map((r) => r.user_id)
  }

  delete(endpoint: string): void {
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
  }
}

export class SqliteNotificationSettingsRepository implements NotificationSettingsRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: string): { settings: NotificationSettings; state: NotificationState } | undefined {
    const row = this.db.prepare('SELECT settings, state FROM notification_settings WHERE user_id = ?').get(userId) as
      | { settings: string; state: string }
      | undefined
    return row ? { settings: JSON.parse(row.settings), state: JSON.parse(row.state) } : undefined
  }

  save(userId: string, settings: NotificationSettings, state: NotificationState): void {
    this.db
      .prepare(
        `INSERT INTO notification_settings (user_id, settings, state) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, state = excluded.state`,
      )
      .run(userId, JSON.stringify(settings), JSON.stringify(state))
  }
}

export class SqliteCalendarFeedRepository implements CalendarFeedRepository {
  constructor(private readonly db: DatabaseSync) {}

  tokenOf(userId: string): string | undefined {
    return (this.db.prepare('SELECT token FROM calendar_feeds WHERE user_id = ?').get(userId) as { token: string } | undefined)?.token
  }

  userOf(token: string): string | undefined {
    return (this.db.prepare('SELECT user_id FROM calendar_feeds WHERE token = ?').get(token) as { user_id: string } | undefined)?.user_id
  }

  save(userId: string, token: string): void {
    this.db
      .prepare('INSERT INTO calendar_feeds (user_id, token) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token')
      .run(userId, token)
  }
}

/** Secrets propres à l'instance (clés VAPID…), générés au premier démarrage. */
export class SqliteSecretStore {
  constructor(private readonly db: DatabaseSync) {}

  getOrCreate(name: string, create: () => string): string {
    const row = this.db.prepare('SELECT value FROM app_secrets WHERE name = ?').get(name) as { value: string } | undefined
    if (row) return row.value
    const value = create()
    this.db.prepare('INSERT INTO app_secrets (name, value) VALUES (?, ?)').run(name, value)
    return value
  }
}
