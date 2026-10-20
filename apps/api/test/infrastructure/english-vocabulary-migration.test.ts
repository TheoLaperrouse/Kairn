import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrate } from '../../src/infrastructure/persistence/database'

/** Last schema version that stored the French enum values. */
const FRENCH_VOCABULARY_VERSION = 3

function legacyDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  migrate(db, FRENCH_VOCABULARY_VERSION)
  db.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('u1', 'a@b.c', 'Alex', 'x', '2026-01-01')").run()
  return db
}

function insert(db: DatabaseSync, sql: string, ...documents: unknown[]): void {
  db.prepare(sql).run(...documents.map((d) => (typeof d === 'string' ? d : JSON.stringify(d))))
}

function document(db: DatabaseSync, sql: string): any {
  return JSON.parse((db.prepare(sql).get() as { data: string }).data)
}

describe('English vocabulary migration', () => {
  it('rewrites the stored French enum values to the English ones', () => {
    const db = legacyDatabase()
    insert(db, "INSERT INTO profiles (user_id, data) VALUES ('u1', ?)", { name: 'Alex', level: 'CONFIRME', terrain: 'PLAT' })
    insert(db, "INSERT INTO plans (user_id, data) VALUES ('u1', ?)", {
      id: 'p1',
      weeks: [{ index: 0, phase: 'FONCIER', focus: 'COURSE' }, { index: 1, phase: 'AFFUTAGE' }, { index: 2, phase: 'COURSE' }],
      adjustments: [{ id: 'a1', reason: 'SEANCE_MANQUEE', summary: 'MALADIE' }, { id: 'a2', reason: 'FATIGUE' }, { id: 'a3', reason: 'BLESSURE' }],
      warnings: ['SORTIE_LONGUE'],
    })
    insert(db, "INSERT INTO planned_sessions (id, user_id, date, data) VALUES ('s1', 'u1', '2027-03-02', ?)", {
      id: 's1',
      type: 'SORTIE_LONGUE',
      title: 'COURSE',
      notes: 'REPOS',
      status: 'PLANNED',
      steps: [
        { kind: 'ECHAUFFEMENT', label: 'RECUP' },
        { kind: 'EFFORT', label: 'Effort' },
        { kind: 'RECUP', label: 'Récup' },
        { kind: 'CONTINU', label: 'Continu' },
        { kind: 'RETOUR_CALME', label: 'Retour au calme' },
      ],
    })
    insert(db, "INSERT INTO planned_sessions (id, user_id, date, data) VALUES ('s2', 'u1', '2027-03-03', ?)", { id: 's2', type: 'VELO_FORCE', steps: [] })
    insert(db, "INSERT INTO race_courses (user_id, data) VALUES ('u1', ?)", {
      name: 'FORT',
      settings: { startTime: '06:00', temperatureC: 15, sweat: 'MOYEN', gut: 'ENTRAINE', weightKg: 65 },
    })
    insert(db, "INSERT INTO check_ins (user_id, date, data) VALUES ('u1', '2027-03-02', ?)", { date: '2027-03-02', notes: 'MALADIE' })

    migrate(db)

    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBeGreaterThan(FRENCH_VOCABULARY_VERSION)
    expect(document(db, 'SELECT data FROM profiles')).toEqual({ name: 'Alex', level: 'ADVANCED', terrain: 'FLAT' })

    const plan = document(db, 'SELECT data FROM plans')
    expect(plan.weeks.map((w: { phase: string }) => w.phase)).toEqual(['BASE', 'TAPER', 'RACE'])
    expect(plan.weeks[0].focus).toBe('COURSE')
    expect(plan.adjustments.map((a: { reason: string }) => a.reason)).toEqual(['MISSED_SESSION', 'FATIGUE', 'INJURY'])
    expect(plan.adjustments[0].summary).toBe('MALADIE')
    expect(plan.warnings).toEqual(['SORTIE_LONGUE'])

    const session = document(db, "SELECT data FROM planned_sessions WHERE id = 's1'")
    expect(session).toMatchObject({ type: 'LONG_RUN', title: 'COURSE', notes: 'REPOS', status: 'PLANNED' })
    expect(session.steps.map((s: { kind: string }) => s.kind)).toEqual(['WARMUP', 'EFFORT', 'RECOVERY', 'CONTINUOUS', 'COOLDOWN'])
    expect(session.steps[0].label).toBe('RECUP')
    expect(document(db, "SELECT data FROM planned_sessions WHERE id = 's2'").type).toBe('BIKE_STRENGTH')

    const course = document(db, 'SELECT data FROM race_courses')
    expect(course.name).toBe('FORT')
    expect(course.settings).toMatchObject({ sweat: 'MEDIUM', gut: 'TRAINED' })

    expect(document(db, 'SELECT data FROM check_ins')).toEqual({ date: '2027-03-02', notes: 'MALADIE' })
  })

  it('leaves documents already in the English vocabulary unchanged', () => {
    const db = legacyDatabase()
    const profile = { name: 'Alex', level: 'BEGINNER', terrain: 'HILLS' }
    insert(db, "INSERT INTO profiles (user_id, data) VALUES ('u1', ?)", profile)

    migrate(db)

    expect(document(db, 'SELECT data FROM profiles')).toEqual(profile)
  })
})
