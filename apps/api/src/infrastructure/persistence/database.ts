import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { migrateToEnglishVocabulary } from './english-vocabulary-migration'

/**
 * Migrations versioned through `PRAGMA user_version`. A published migration is never
 * modified: a new one is appended to the end of the list instead.
 * A migration is either a SQL script or a function, for data rewrites SQL cannot express.
 */
type Migration = string | ((db: DatabaseSync) => void)

const MIGRATIONS: Migration[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE device_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX idx_device_sessions_user ON device_sessions(user_id);
  CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );
  CREATE TABLE goals (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );
  CREATE TABLE plans (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );
  CREATE TABLE planned_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX idx_planned_sessions_user_date ON planned_sessions(user_id, date);
  CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    data TEXT NOT NULL,
    UNIQUE (user_id, external_id)
  );
  CREATE INDEX idx_activities_user_start ON activities(user_id, start_time DESC);
  CREATE TABLE integrations (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (user_id, provider)
  );
  `,
  `
  CREATE TABLE race_courses (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );
  CREATE TABLE check_ins (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (user_id, date)
  );
  `,
  `
  CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );
  CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
  CREATE TABLE notification_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings TEXT NOT NULL,
    state TEXT NOT NULL
  );
  CREATE TABLE calendar_feeds (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE
  );
  CREATE TABLE app_secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  migrateToEnglishVocabulary,
]

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  migrate(db)
  return db
}

/** Applies the pending migrations, optionally stopping at version `target` (used by tests). */
export function migrate(db: DatabaseSync, target = MIGRATIONS.length): void {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let i = version; i < target; i++) {
    const migration = MIGRATIONS[i]!
    transaction(db, () => {
      if (typeof migration === 'string') db.exec(migration)
      else migration(db)
      db.exec(`PRAGMA user_version = ${i + 1}`)
    })
  }
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
