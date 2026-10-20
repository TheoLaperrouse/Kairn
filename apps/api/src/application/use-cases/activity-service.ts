import {
  activityDay,
  profileFromSamples,
  sportFromLabel,
  type Activity,
  type ActivitySample,
  type ImportedActivity,
  type ProfilePoint,
} from '../../domain/activity/activity'
import { isGenericName, suggestActivityName } from '../../domain/activity/activity-name'
import { assignDay } from '../../domain/activity/session-matcher'
import { DEFAULT_TIME_ZONE, localTime, type IsoDate } from '../../domain/shared/dates'
import { DomainError, NotFoundError } from '../../domain/shared/errors'
import {
  RateLimitedError,
  type ActivityFileParser,
  type ActivityImportListener,
  type ActivityProvider,
  type IntegrationTokens,
  type ActivityRepository,
  type Clock,
  type IdGenerator,
  type IntegrationStore,
  type PlanRepository,
  type TimeZoneProvider,
} from '../ports'

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

export interface UserSyncResult {
  userId: string
  imported: number
  error?: string
}

/** Initial sync window when a provider is first connected. */
const INITIAL_SYNC_DAYS = 60
/** Detailed tracks fetched afterwards on each sync (Strava quota: 100 reads / 15 min). */
const BACKFILL_PER_SYNC = 20

export class ActivityService {
  /** Syncs in progress, per user and provider: a webhook and the periodic sync never run twice. */
  private readonly running = new Map<string, Promise<ImportOutcome[]>>()

  constructor(
    private readonly activities: ActivityRepository,
    private readonly plans: PlanRepository,
    private readonly parsers: ActivityFileParser[],
    private readonly providers: ActivityProvider[],
    private readonly integrations: IntegrationStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly listeners: ActivityImportListener[] = [],
    private readonly timeZones: TimeZoneProvider = { timeZoneOf: () => DEFAULT_TIME_ZONE },
  ) {}

  /** Lightweight list: the detailed track is only returned with a single activity. */
  list(userId: string, limit?: number): Activity[] {
    return this.activities.list(userId, limit).map(withoutSamples)
  }

  get(userId: string, id: string): Activity {
    const activity = this.activities.get(userId, id)
    if (!activity) throw new NotFoundError('Activité', id)
    return activity
  }

  delete(userId: string, id: string): void {
    const activity = this.get(userId, id)
    this.activities.delete(userId, id)
    if (activity.plannedSessionId) this.unlinkSession(userId, activity.plannedSessionId)
    this.relinkDay(userId, activityDay(activity))
  }

  /** `automatic`: import without user action (watched folder), which deserves a notification. */
  async importFile(userId: string, filename: string, content: Buffer, automatic = false): Promise<ImportOutcome> {
    const parser = this.parsers.find((p) => filename.toLowerCase().endsWith(p.extension))
    if (!parser) return { status: 'FAILED', filename, reason: 'Format non pris en charge (FIT, GPX ou TCX attendu)' }
    try {
      return this.store(userId, await parser.parse(content, filename), filename, automatic)
    } catch (error) {
      return { status: 'FAILED', filename, reason: error instanceof Error ? error.message : 'Fichier illisible' }
    }
  }

  /** Common entry point for all imports: deduplication, then matching against the plan. */
  store(userId: string, imported: ImportedActivity, label = imported.name, automatic = false): ImportOutcome {
    if (this.activities.existsByExternalId(userId, imported.externalId)) return { status: 'DUPLICATE', filename: label }

    const localDate = imported.localDate ?? localTime(new Date(imported.startTime), this.timeZones.timeZoneOf(userId)).date
    const id = this.ids.next()
    this.activities.save({
      ...imported,
      localDate,
      profile: completeProfile(imported.profile, imported.samples),
      id,
      userId,
      autoNamed: isGenericName(imported.name),
    })
    this.relinkDay(userId, localDate)
    const activity = this.activities.get(userId, id)!
    for (const listener of this.listeners) listener.activityImported(userId, activity, automatic)
    const session = this.plans.get(userId)?.sessions.find((s) => s.id === activity.plannedSessionId)
    return { status: 'IMPORTED', activity: withoutSamples(activity), matchedSessionTitle: session?.title }
  }

  providerStatuses(userId: string): ProviderStatus[] {
    return this.providers.map((provider) => {
      const tokens = this.integrations.get(userId, provider.name)
      return {
        provider: provider.name,
        configured: provider.isConfigured(),
        connected: Boolean(tokens),
        athleteName: tokens?.athleteName,
        lastSyncAt: tokens?.lastSyncAt,
      }
    })
  }

  authorizationUrl(providerName: string, state: string): string {
    return this.provider(providerName).authorizationUrl(state)
  }

  async connect(userId: string, providerName: string, code: string): Promise<void> {
    const tokens = await this.provider(providerName).exchangeCode(code)
    this.integrations.save(userId, providerName, tokens)
  }

  disconnect(userId: string, providerName: string): void {
    this.integrations.delete(userId, providerName)
  }

  sync(userId: string, providerName: string): Promise<ImportOutcome[]> {
    const key = `${userId}:${providerName}`
    const pending = this.running.get(key)
    if (pending) return pending
    const run = this.runSync(userId, providerName).finally(() => this.running.delete(key))
    this.running.set(key, run)
    return run
  }

  /** Syncs every connected account (periodic job). One failure does not stop the other accounts. */
  async syncAll(providerName: string): Promise<UserSyncResult[]> {
    const results: UserSyncResult[] = []
    for (const userId of this.integrations.connectedUsers(providerName)) results.push(await this.syncSafely(userId, providerName))
    return results
  }

  /**
   * Provider notification: an activity was created on the `athleteId` account.
   * Connections made before the athlete id was stored are all synced.
   */
  async syncAthlete(providerName: string, athleteId: string): Promise<UserSyncResult[]> {
    const owner = this.integrations.findUserByAthleteId(providerName, athleteId)
    const userIds = owner
      ? [owner]
      : this.integrations.connectedUsers(providerName).filter((id) => !this.integrations.get(id, providerName)?.athleteId)
    return Promise.all(userIds.map((userId) => this.syncSafely(userId, providerName)))
  }

  /** Activity deleted on the provider side: remove it here too, and its session goes back to planned. */
  removeProviderActivity(providerName: string, athleteId: string, externalId: string): void {
    const found = this.providerActivity(providerName, athleteId, externalId)
    if (found) this.delete(found.owner, found.activity.id)
  }

  /**
   * Activity updated on the provider side. A sport change (hike turned into a run…)
   * can change its matching session, so the day is matched again.
   */
  updateProviderActivity(providerName: string, athleteId: string, externalId: string, change: { name?: string; sportLabel?: string }): void {
    const found = this.providerActivity(providerName, athleteId, externalId)
    if (!found) return
    const { owner, activity } = found
    const sport = change.sportLabel ? sportFromLabel(change.sportLabel) : activity.sport
    const name = change.name?.trim()
    const updated: Activity = { ...activity, sport, ...(name ? { name, autoNamed: isGenericName(name) } : {}) }
    this.activities.save(updated)
    if (sport !== activity.sport) this.relinkDay(owner, activityDay(activity))
  }

  /** The athlete revoked Kairn's access from the provider. */
  disconnectAthlete(providerName: string, athleteId: string): void {
    const owner = this.integrations.findUserByAthleteId(providerName, athleteId)
    if (owner) this.integrations.delete(owner, providerName)
  }

  private providerActivity(providerName: string, athleteId: string, externalId: string): { owner: string; activity: Activity } | undefined {
    const owner = this.integrations.findUserByAthleteId(providerName, athleteId)
    const activity = owner ? this.activities.findByExternalId(owner, externalId) : undefined
    return owner && activity ? { owner, activity } : undefined
  }

  private async syncSafely(userId: string, providerName: string): Promise<UserSyncResult> {
    try {
      const outcomes = await this.sync(userId, providerName)
      return { userId, imported: outcomes.filter((o) => o.status === 'IMPORTED').length }
    } catch (error) {
      return { userId, imported: 0, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private async runSync(userId: string, providerName: string): Promise<ImportOutcome[]> {
    const provider = this.provider(providerName)
    let tokens = this.integrations.get(userId, providerName)
    if (!tokens) throw new DomainError(`${providerName} n'est pas connecté`)

    const now = this.clock.now()
    if (tokens.expiresAt * 1000 <= now.getTime() + 60_000) tokens = await provider.refresh(tokens)
    const since = tokens.lastSyncAt
      ? new Date(Date.parse(tokens.lastSyncAt) - 86_400_000)
      : new Date(now.getTime() - INITIAL_SYNC_DAYS * 86_400_000)

    const fetched = await provider.fetchSince(tokens, since)
    const fresh = fetched.filter((a) => !this.activities.existsByExternalId(userId, a.externalId))
    const budget = { remaining: BACKFILL_PER_SYNC }
    // Most recent first: those are the ones analysed and notified.
    for (const activity of [...fresh].sort((a, b) => b.startTime.localeCompare(a.startTime))) {
      activity.samples = await this.fetchSamples(provider, tokens, activity.externalId, budget)
    }
    const outcomes = fetched.map((activity) => this.store(userId, activity, activity.name, true))
    await this.backfillSamples(userId, provider, tokens, budget)
    this.integrations.save(userId, providerName, { ...tokens, lastSyncAt: now.toISOString() })
    return outcomes
  }

  /** Detailed track, within the call budget; `undefined` if it could not be read. */
  private async fetchSamples(
    provider: ActivityProvider,
    tokens: IntegrationTokens,
    externalId: string,
    budget: { remaining: number },
  ): Promise<ImportedActivity['samples']> {
    if (!provider.fetchSamples || budget.remaining <= 0) return undefined
    budget.remaining--
    try {
      return await provider.fetchSamples(tokens, externalId)
    } catch (error) {
      if (error instanceof RateLimitedError) budget.remaining = 0
      return undefined
    }
  }

  /** Fills in activities imported before their tracks were fetched (or while the quota was exhausted). */
  private async backfillSamples(userId: string, provider: ActivityProvider, tokens: IntegrationTokens, budget: { remaining: number }) {
    const source = provider.name.toUpperCase()
    const missing = this.activities.list(userId).filter((a) => a.source === source && a.samples === undefined)
    for (const activity of missing) {
      if (budget.remaining <= 0) return
      const samples = await this.fetchSamples(provider, tokens, activity.externalId, budget)
      if (samples === undefined) continue
      this.activities.save({ ...activity, samples, profile: completeProfile(activity.profile, samples) })
    }
  }

  private provider(name: string): ActivityProvider {
    const provider = this.providers.find((p) => p.name === name)
    if (!provider) throw new NotFoundError('Fournisseur', name)
    if (!provider.isConfigured()) throw new DomainError(`${name} n'est pas configuré sur ce serveur`)
    return provider
  }

  /**
   * Recomputes a day's matches: the day's sessions that are free or already
   * linked to one of the day's activities. A session ticked by hand without an activity can be taken over;
   * if it is not, it stays done.
   */
  private relinkDay(userId: string, day: IsoDate): void {
    const activities = this.activities.list(userId, 200).filter((a) => activityDay(a) === day)
    const ids = new Set(activities.map((a) => a.id))
    const sessions = (this.plans.get(userId)?.sessions ?? []).filter((s) => s.date === day && (!s.activityId || ids.has(s.activityId)))
    const assignment = assignDay(activities, sessions)

    for (const activity of activities) {
      const sessionId = assignment.get(activity.id)
      const name = activity.autoNamed ? suggestActivityName(activity, sessions.find((s) => s.id === sessionId)) : activity.name
      if (activity.plannedSessionId !== sessionId || activity.name !== name) this.activities.save({ ...activity, plannedSessionId: sessionId, name })
    }
    for (const session of sessions) {
      const activityId = activities.find((a) => assignment.get(a.id) === session.id)?.id
      if (activityId && (session.activityId !== activityId || session.status !== 'DONE')) {
        this.plans.updateSession(userId, { ...session, status: 'DONE', activityId })
      } else if (!activityId && session.activityId) {
        this.plans.updateSession(userId, { ...session, status: 'PLANNED', activityId: undefined })
      }
    }
  }

  private unlinkSession(userId: string, sessionId: string): void {
    const session = this.plans.get(userId)?.sessions.find((s) => s.id === sessionId)
    if (session) this.plans.updateSession(userId, { ...session, status: 'PLANNED', activityId: undefined })
  }
}

function withoutSamples({ samples: _samples, ...activity }: Activity): Activity {
  return activity
}

/** Elevation profile rebuilt from the track when the provider does not supply one. */
function completeProfile(profile: ProfilePoint[], samples: ActivitySample[] | undefined): ProfilePoint[] {
  return profile.length < 2 && samples?.length ? profileFromSamples(samples) : profile
}
