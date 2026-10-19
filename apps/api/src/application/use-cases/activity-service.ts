import { profileFromSamples, type Activity, type ImportedActivity } from '../../domain/activity/activity'
import { matchActivityToSession } from '../../domain/activity/session-matcher'
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

/** Fenêtre de synchronisation initiale lors de la première connexion d'un fournisseur. */
const INITIAL_SYNC_DAYS = 60
/** Traces détaillées récupérées après coup à chaque synchro (quota Strava : 100 lectures / 15 min). */
const BACKFILL_PER_SYNC = 20

export class ActivityService {
  /** Synchronisations en cours, par utilisateur et fournisseur : un webhook et la synchro périodique ne se doublent pas. */
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
  ) {}

  /** Liste allégée : la trace détaillée n'est renvoyée qu'avec une activité seule. */
  list(userId: string, limit?: number): Activity[] {
    return this.activities.list(userId, limit).map(({ samples: _samples, ...activity }) => activity)
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
  }

  /** `automatic` : import sans action de l'utilisateur (dossier surveillé), qui mérite une notification. */
  async importFile(userId: string, filename: string, content: Buffer, automatic = false): Promise<ImportOutcome> {
    const parser = this.parsers.find((p) => p.supports(filename))
    if (!parser) return { status: 'FAILED', filename, reason: 'Format non pris en charge (FIT, GPX ou TCX attendu)' }
    try {
      return this.store(userId, await parser.parse(content, filename), filename, automatic)
    } catch (error) {
      return { status: 'FAILED', filename, reason: error instanceof Error ? error.message : 'Fichier illisible' }
    }
  }

  /** Point d'entrée commun à tous les imports : dédoublonnage puis rattachement au plan. */
  store(userId: string, imported: ImportedActivity, label = imported.name, automatic = false): ImportOutcome {
    if (this.activities.existsByExternalId(userId, imported.externalId)) return { status: 'DUPLICATE', filename: label }

    const plan = this.plans.get(userId)
    const session = plan ? matchActivityToSession(imported, plan.sessions) : undefined
    const profile = imported.profile.length < 2 && imported.samples?.length ? profileFromSamples(imported.samples) : imported.profile
    const activity: Activity = { ...imported, profile, id: this.ids.next(), userId, plannedSessionId: session?.id }
    this.activities.save(activity)
    if (session) this.plans.updateSession(userId, { ...session, status: 'DONE', activityId: activity.id })
    for (const listener of this.listeners) listener.activityImported(userId, activity, automatic)
    const { samples: _samples, ...light } = activity
    return { status: 'IMPORTED', activity: light, matchedSessionTitle: session?.title }
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

  /** Synchronisation de tous les comptes connectés (tâche périodique). Une erreur n'interrompt pas les autres comptes. */
  async syncAll(providerName: string): Promise<UserSyncResult[]> {
    const results: UserSyncResult[] = []
    for (const userId of this.integrations.connectedUsers(providerName)) results.push(await this.syncSafely(userId, providerName))
    return results
  }

  /**
   * Notification du fournisseur : une activité a été créée sur le compte `athleteId`.
   * Les connexions antérieures à l'enregistrement de l'identifiant sont toutes synchronisées.
   */
  async syncAthlete(providerName: string, athleteId: string): Promise<UserSyncResult[]> {
    const owner = this.integrations.findUserByAthleteId(providerName, athleteId)
    const userIds = owner
      ? [owner]
      : this.integrations.connectedUsers(providerName).filter((id) => !this.integrations.get(id, providerName)?.athleteId)
    return Promise.all(userIds.map((userId) => this.syncSafely(userId, providerName)))
  }

  /** L'athlète a retiré l'accès à Kairn depuis le fournisseur. */
  disconnectAthlete(providerName: string, athleteId: string): void {
    const owner = this.integrations.findUserByAthleteId(providerName, athleteId)
    if (owner) this.integrations.delete(owner, providerName)
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
    // Les plus récentes d'abord : ce sont elles qu'on analyse et notifie.
    for (const activity of [...fresh].sort((a, b) => b.startTime.localeCompare(a.startTime))) {
      activity.samples = await this.fetchSamples(provider, tokens, activity.externalId, budget)
    }
    const outcomes = fetched.map((activity) => this.store(userId, activity, activity.name, true))
    await this.backfillSamples(userId, provider, tokens, budget)
    this.integrations.save(userId, providerName, { ...tokens, lastSyncAt: now.toISOString() })
    return outcomes
  }

  /** Trace détaillée, dans la limite du budget d'appels ; `undefined` si on n'a pas pu la lire. */
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

  /** Complète les activités importées avant la récupération des traces (ou quand le quota était atteint). */
  private async backfillSamples(userId: string, provider: ActivityProvider, tokens: IntegrationTokens, budget: { remaining: number }) {
    const source = provider.name.toUpperCase()
    const missing = this.activities.list(userId).filter((a) => a.source === source && a.samples === undefined)
    for (const activity of missing) {
      if (budget.remaining <= 0) return
      const samples = await this.fetchSamples(provider, tokens, activity.externalId, budget)
      if (samples === undefined) continue
      const profile = activity.profile.length < 2 && samples.length ? profileFromSamples(samples) : activity.profile
      this.activities.save({ ...activity, samples, profile })
    }
  }

  private provider(name: string): ActivityProvider {
    const provider = this.providers.find((p) => p.name === name)
    if (!provider) throw new NotFoundError('Fournisseur', name)
    if (!provider.isConfigured()) throw new DomainError(`${name} n'est pas configuré sur ce serveur`)
    return provider
  }

  private unlinkSession(userId: string, sessionId: string): void {
    const session = this.plans.get(userId)?.sessions.find((s) => s.id === sessionId)
    if (session) this.plans.updateSession(userId, { ...session, status: 'PLANNED', activityId: undefined })
  }
}
