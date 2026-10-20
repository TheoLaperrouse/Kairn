import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
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

/** Petit socle commun : la plupart des tables stockent l'objet en JSON dans une colonne `data`. */
abstract class SqliteRepository {
  constructor(protected readonly db: DatabaseSync) {}

  protected row(sql: string, ...params: SQLInputValue[]): Row | undefined {
    return this.db.prepare(sql).get(...params)
  }

  protected rows(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.db.prepare(sql).all(...params)
  }

  protected document<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    const row = this.row(sql, ...params)
    return row ? (JSON.parse(row.data as string) as T) : undefined
  }

  protected documents<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.rows(sql, ...params).map((row) => JSON.parse(row.data as string) as T)
  }

  protected column(sql: string, ...params: SQLInputValue[]): string[] {
    return this.rows(sql, ...params).map((row) => Object.values(row)[0] as string)
  }

  /** Exécute une écriture et renvoie le nombre de lignes touchées. */
  protected run(sql: string, ...params: SQLInputValue[]): number {
    return Number(this.db.prepare(sql).run(...params).changes)
  }
}

export class SqliteUserRepository extends SqliteRepository implements UserRepository {
  findByEmail(email: string): User | undefined {
    return toUser(this.row('SELECT * FROM users WHERE email = ?', email))
  }

  findById(id: string): User | undefined {
    return toUser(this.row('SELECT * FROM users WHERE id = ?', id))
  }

  save(user: User): void {
    this.run(
      `INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, password_hash = excluded.password_hash`,
      user.id, user.email, user.displayName, user.passwordHash, user.createdAt,
    )
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

export class SqliteSessionRepository extends SqliteRepository implements SessionRepository {
  findByTokenHash(tokenHash: string): DeviceSession | undefined {
    const row = this.row('SELECT * FROM device_sessions WHERE token_hash = ?', tokenHash)
    return row && toSession(row)
  }

  listByUser(userId: string): DeviceSession[] {
    return this.rows('SELECT * FROM device_sessions WHERE user_id = ?', userId).map(toSession)
  }

  save(session: DeviceSession): void {
    this.run(
      `INSERT INTO device_sessions (id, user_id, token_hash, device_label, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      session.id, session.userId, session.tokenHash, session.deviceLabel, session.createdAt, session.lastSeenAt, session.expiresAt,
    )
  }

  touch(id: string, lastSeenAt: string): void {
    this.run('UPDATE device_sessions SET last_seen_at = ? WHERE id = ?', lastSeenAt, id)
  }

  delete(userId: string, id: string): boolean {
    return this.run('DELETE FROM device_sessions WHERE id = ? AND user_id = ?', id, userId) > 0
  }

  deleteExpired(now: string): void {
    this.run('DELETE FROM device_sessions WHERE expires_at <= ?', now)
  }
}

function toSession(row: Row): DeviceSession {
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

/** Dépôt « un document JSON par utilisateur ». */
class JsonDocumentRepository<T> extends SqliteRepository {
  constructor(
    db: DatabaseSync,
    private readonly table: 'profiles' | 'goals' | 'plans' | 'race_courses',
  ) {
    super(db)
  }

  get(userId: string): T | undefined {
    return this.document<T>(`SELECT data FROM ${this.table} WHERE user_id = ?`, userId)
  }

  save(userId: string, value: T): void {
    this.run(
      `INSERT INTO ${this.table} (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data`,
      userId,
      JSON.stringify(value),
    )
  }

  delete(userId: string): void {
    this.run(`DELETE FROM ${this.table} WHERE user_id = ?`, userId)
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
  constructor(db: DatabaseSync) {
    super(db, 'race_courses')
  }
}

export class SqliteCheckInRepository extends SqliteRepository implements CheckInRepository {
  listSince(userId: string, from: string): CheckIn[] {
    return this.documents('SELECT data FROM check_ins WHERE user_id = ? AND date >= ? ORDER BY date', userId, from)
  }

  save(userId: string, checkIn: CheckIn): void {
    this.run(
      'INSERT INTO check_ins (user_id, date, data) VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET data = excluded.data',
      userId, checkIn.date, JSON.stringify(checkIn),
    )
  }
}

/** Le plan est stocké en deux parties : l'en-tête (semaines, alertes) et une ligne par séance. */
export class SqlitePlanRepository extends SqliteRepository implements PlanRepository {
  private readonly headers = new JsonDocumentRepository<Omit<TrainingPlan, 'sessions'>>(this.db, 'plans')

  get(userId: string): TrainingPlan | undefined {
    const header = this.headers.get(userId)
    if (!header) return undefined
    return { ...header, sessions: this.documents('SELECT data FROM planned_sessions WHERE user_id = ? ORDER BY date, rowid', userId) }
  }

  save(userId: string, plan: TrainingPlan): void {
    const { sessions, ...header } = plan
    transaction(this.db, () => {
      this.headers.save(userId, header)
      this.run('DELETE FROM planned_sessions WHERE user_id = ?', userId)
      const insert = this.db.prepare('INSERT INTO planned_sessions (id, user_id, date, data) VALUES (?, ?, ?, ?)')
      for (const session of sessions) insert.run(session.id, userId, session.date, JSON.stringify(session))
    })
  }

  updateSession(userId: string, session: PlannedSession): void {
    this.run(
      'UPDATE planned_sessions SET data = ?, date = ? WHERE id = ? AND user_id = ?',
      JSON.stringify(session), session.date, session.id, userId,
    )
  }
}

export class SqliteActivityRepository extends SqliteRepository implements ActivityRepository {
  list(userId: string, limit = 10_000): Activity[] {
    return this.documents('SELECT data FROM activities WHERE user_id = ? ORDER BY start_time DESC LIMIT ?', userId, limit)
  }

  get(userId: string, id: string): Activity | undefined {
    return this.document('SELECT data FROM activities WHERE id = ? AND user_id = ?', id, userId)
  }

  findByExternalId(userId: string, externalId: string): Activity | undefined {
    return this.document('SELECT data FROM activities WHERE user_id = ? AND external_id = ?', userId, externalId)
  }

  existsByExternalId(userId: string, externalId: string): boolean {
    return Boolean(this.row('SELECT 1 FROM activities WHERE user_id = ? AND external_id = ?', userId, externalId))
  }

  save(activity: Activity): void {
    this.run(
      `INSERT INTO activities (id, user_id, external_id, start_time, data) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      activity.id, activity.userId, activity.externalId, activity.startTime, JSON.stringify(activity),
    )
  }

  delete(userId: string, id: string): boolean {
    return this.run('DELETE FROM activities WHERE id = ? AND user_id = ?', id, userId) > 0
  }
}

export class SqliteIntegrationStore extends SqliteRepository implements IntegrationStore {
  get(userId: string, provider: string): IntegrationTokens | undefined {
    return this.document('SELECT data FROM integrations WHERE user_id = ? AND provider = ?', userId, provider)
  }

  save(userId: string, provider: string, tokens: IntegrationTokens): void {
    this.run(
      `INSERT INTO integrations (user_id, provider, data) VALUES (?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET data = excluded.data`,
      userId, provider, JSON.stringify(tokens),
    )
  }

  delete(userId: string, provider: string): void {
    this.run('DELETE FROM integrations WHERE user_id = ? AND provider = ?', userId, provider)
  }

  connectedUsers(provider: string): string[] {
    return this.column('SELECT user_id FROM integrations WHERE provider = ?', provider)
  }

  findUserByAthleteId(provider: string, athleteId: string): string | undefined {
    return this.column("SELECT user_id FROM integrations WHERE provider = ? AND json_extract(data, '$.athleteId') = ?", provider, athleteId)[0]
  }
}

export class SqlitePushSubscriptionRepository extends SqliteRepository implements PushSubscriptionRepository {
  /** Un même navigateur réabonné (ou passé à un autre compte) remplace l'abonnement existant. */
  save(subscription: StoredPushSubscription): void {
    this.run(
      `INSERT INTO push_subscriptions (endpoint, user_id, data) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, data = excluded.data`,
      subscription.endpoint, subscription.userId, JSON.stringify(subscription),
    )
  }

  listByUser(userId: string): StoredPushSubscription[] {
    return this.documents('SELECT data FROM push_subscriptions WHERE user_id = ? ORDER BY rowid', userId)
  }

  usersWithSubscriptions(): string[] {
    return this.column('SELECT DISTINCT user_id FROM push_subscriptions')
  }

  delete(endpoint: string): void {
    this.run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint)
  }
}

export class SqliteNotificationSettingsRepository extends SqliteRepository implements NotificationSettingsRepository {
  get(userId: string): { settings: NotificationSettings; state: NotificationState } | undefined {
    const row = this.row('SELECT settings, state FROM notification_settings WHERE user_id = ?', userId)
    return row ? { settings: JSON.parse(row.settings as string), state: JSON.parse(row.state as string) } : undefined
  }

  save(userId: string, settings: NotificationSettings, state: NotificationState): void {
    this.run(
      `INSERT INTO notification_settings (user_id, settings, state) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, state = excluded.state`,
      userId, JSON.stringify(settings), JSON.stringify(state),
    )
  }
}

export class SqliteCalendarFeedRepository extends SqliteRepository implements CalendarFeedRepository {
  tokenOf(userId: string): string | undefined {
    return this.column('SELECT token FROM calendar_feeds WHERE user_id = ?', userId)[0]
  }

  userOf(token: string): string | undefined {
    return this.column('SELECT user_id FROM calendar_feeds WHERE token = ?', token)[0]
  }

  save(userId: string, token: string): void {
    this.run('INSERT INTO calendar_feeds (user_id, token) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token', userId, token)
  }
}

/** Secrets propres à l'instance (clés VAPID…), générés au premier démarrage. */
export class SqliteSecretStore extends SqliteRepository {
  getOrCreate(name: string, create: () => string): string {
    const [existing] = this.column('SELECT value FROM app_secrets WHERE name = ?', name)
    if (existing) return existing
    const value = create()
    this.run('INSERT INTO app_secrets (name, value) VALUES (?, ?)', name, value)
    return value
  }
}
