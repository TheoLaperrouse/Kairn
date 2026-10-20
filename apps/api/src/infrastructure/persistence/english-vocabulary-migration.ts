import type { DatabaseSync } from 'node:sqlite'

/**
 * Rewrites the stored JSON documents from the former French enum values to the English ones.
 * The tables are frozen here on purpose: later changes to the domain types must not alter
 * what this migration does. Only known fields are rewritten, and only when their value is
 * exactly one of the former values, so free text (titles, notes, labels) is never touched.
 */

type Json = Record<string, unknown>
type Vocabulary = Readonly<Record<string, string>>

const LEVEL: Vocabulary = { DEBUTANT: 'BEGINNER', INTERMEDIAIRE: 'INTERMEDIATE', CONFIRME: 'ADVANCED' }
const TERRAIN: Vocabulary = { MONTAGNE: 'MOUNTAINS', COLLINES: 'HILLS', PLAT: 'FLAT' }
const PHASE: Vocabulary = { FONCIER: 'BASE', DEVELOPPEMENT: 'BUILD', SPECIFIQUE: 'SPECIFIC', AFFUTAGE: 'TAPER', COURSE: 'RACE' }
const ADJUSTMENT_REASON: Vocabulary = {
  SEANCE_MANQUEE: 'MISSED_SESSION',
  MALADIE: 'ILLNESS',
  BLESSURE: 'INJURY',
  INDISPONIBLE: 'UNAVAILABLE',
}
const SESSION_TYPE: Vocabulary = {
  RECUPERATION: 'RECOVERY',
  SORTIE_LONGUE: 'LONG_RUN',
  COTES_COURTES: 'HILL_REPEATS',
  SEUIL_MONTEE: 'UPHILL_THRESHOLD',
  RANDO_COURSE: 'HIKE_RUN',
  DESCENTE: 'DOWNHILL',
  RENFORCEMENT: 'STRENGTH',
  VELO_ENDURANCE: 'BIKE_ENDURANCE',
  VELO_FORCE: 'BIKE_STRENGTH',
  COURSE: 'RACE',
}
const STEP_KIND: Vocabulary = { ECHAUFFEMENT: 'WARMUP', RECUP: 'RECOVERY', RETOUR_CALME: 'COOLDOWN', CONTINU: 'CONTINUOUS' }
const SWEAT: Vocabulary = { FAIBLE: 'LOW', MOYEN: 'MEDIUM', FORT: 'HIGH' }
const GUT: Vocabulary = { AUCUN: 'NONE', PARTIEL: 'PARTIAL', ENTRAINE: 'TRAINED' }

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objects(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isObject) : []
}

function translate(target: unknown, key: string, vocabulary: Vocabulary): void {
  if (!isObject(target)) return
  const value = target[key]
  if (typeof value === 'string' && Object.hasOwn(vocabulary, value)) target[key] = vocabulary[value]
}

function migrateProfile(profile: Json): void {
  translate(profile, 'level', LEVEL)
  translate(profile, 'terrain', TERRAIN)
}

function migrateSession(session: Json): void {
  translate(session, 'type', SESSION_TYPE)
  for (const step of objects(session.steps)) translate(step, 'kind', STEP_KIND)
}

function migratePlan(plan: Json): void {
  for (const week of objects(plan.weeks)) translate(week, 'phase', PHASE)
  for (const adjustment of objects(plan.adjustments)) translate(adjustment, 'reason', ADJUSTMENT_REASON)
  for (const session of objects(plan.sessions)) migrateSession(session)
}

function migrateRaceCourse(course: Json): void {
  translate(course.settings, 'sweat', SWEAT)
  translate(course.settings, 'gut', GUT)
}

/** Rewrites the JSON column of every row of `table`, keyed by its rowid. */
function rewrite(db: DatabaseSync, table: string, migrateDocument: (document: Json) => void): void {
  const update = db.prepare(`UPDATE ${table} SET data = ? WHERE rowid = ?`)
  for (const row of db.prepare(`SELECT rowid, data FROM ${table}`).all()) {
    const document: unknown = JSON.parse(row.data as string)
    if (!isObject(document)) continue
    const before = JSON.stringify(document)
    migrateDocument(document)
    const after = JSON.stringify(document)
    if (after !== before) update.run(after, row.rowid as number)
  }
}

export function migrateToEnglishVocabulary(db: DatabaseSync): void {
  rewrite(db, 'profiles', migrateProfile)
  rewrite(db, 'plans', migratePlan)
  rewrite(db, 'planned_sessions', migrateSession)
  rewrite(db, 'race_courses', migrateRaceCourse)
}
