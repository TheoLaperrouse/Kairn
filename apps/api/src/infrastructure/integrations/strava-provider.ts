import { RateLimitedError, type ActivityProvider, type IntegrationTokens } from '../../application/ports'
import { resampleTrack, sportFromLabel, type ActivitySample, type ImportedActivity } from '../../domain/activity/activity'

export interface StravaConfig {
  clientId?: string
  clientSecret?: string
  redirectUri: string
}

interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete?: { id?: number; firstname?: string; lastname?: string }
}

interface StravaSubscription {
  id: number
  callback_url: string
}

/** Notification envoyée par Strava à chaque création / modification / suppression. */
export interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete'
  object_id: number
  aspect_type: 'create' | 'update' | 'delete'
  owner_id: number
  subscription_id: number
  updates?: Record<string, string>
}

interface StravaActivity {
  id: number
  name: string
  sport_type?: string
  type?: string
  start_date: string
  /** Heure locale du départ, notée comme si elle était UTC (« 2026-10-19T00:30:00Z »). */
  start_date_local?: string
  moving_time: number
  distance: number
  total_elevation_gain: number
  average_heartrate?: number
  max_heartrate?: number
}

/** Flux d'une activité, indexés par type (`key_by_type=true`). */
type StravaStreams = Partial<Record<'time' | 'distance' | 'altitude' | 'heartrate', { data: number[] }>>

const API = 'https://www.strava.com'
const PAGE_SIZE = 100
const MAX_PAGES = 10

/**
 * Pont Garmin → Strava → Kairn. L'API Garmin Connect n'accepte plus de nouveaux
 * développeurs ; en revanche Garmin Connect synchronise automatiquement vers Strava,
 * dont l'API reste ouverte aux applications personnelles.
 */
export class StravaActivityProvider implements ActivityProvider {
  readonly name = 'strava'

  constructor(
    private readonly config: StravaConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret)
  }

  authorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId!,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:read_all',
      state,
    })
    return `${API}/oauth/authorize?${params}`
  }

  async exchangeCode(code: string): Promise<IntegrationTokens> {
    return this.tokenRequest({ code, grant_type: 'authorization_code' })
  }

  async refresh(tokens: IntegrationTokens): Promise<IntegrationTokens> {
    const refreshed = await this.tokenRequest({ refresh_token: tokens.refreshToken, grant_type: 'refresh_token' })
    return {
      ...tokens,
      ...refreshed,
      athleteId: refreshed.athleteId ?? tokens.athleteId,
      athleteName: refreshed.athleteName ?? tokens.athleteName,
    }
  }

  /**
   * Abonnement (unique par application Strava) aux notifications d'activités. Strava vérifie
   * l'URL pendant la création en l'appelant avec `verifyToken` : le serveur doit déjà écouter.
   * Retourne l'identifiant de l'abonnement, recréé si l'URL publique a changé.
   */
  async ensureWebhookSubscription(callbackUrl: string, verifyToken: string): Promise<number> {
    const credentials = new URLSearchParams({ client_id: this.config.clientId!, client_secret: this.config.clientSecret! })
    const listing = await this.http(`${API}/api/v3/push_subscriptions?${credentials}`)
    if (!listing.ok) throw new Error(`Strava a répondu ${listing.status} à la lecture des abonnements`)
    const existing = (await listing.json()) as StravaSubscription[]
    const current = existing.find((s) => s.callback_url === callbackUrl)
    if (current) return current.id
    for (const stale of existing) {
      await this.http(`${API}/api/v3/push_subscriptions/${stale.id}?${credentials}`, { method: 'DELETE' })
    }
    const created = await this.http(`${API}/api/v3/push_subscriptions`, {
      method: 'POST',
      body: new URLSearchParams({ ...Object.fromEntries(credentials), callback_url: callbackUrl, verify_token: verifyToken }),
    })
    if (!created.ok) throw new Error(`Abonnement Strava refusé (${created.status}) : ${await created.text()}`)
    return ((await created.json()) as { id: number }).id
  }

  async fetchSince(tokens: IntegrationTokens, since: Date): Promise<ImportedActivity[]> {
    const result: ImportedActivity[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        after: String(Math.floor(since.getTime() / 1000)),
        per_page: String(PAGE_SIZE),
        page: String(page),
      })
      const response = await this.http(`${API}/api/v3/athlete/activities?${params}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      if (response.status === 429) throw new RateLimitedError('Strava')
      if (!response.ok) throw new Error(`Strava a répondu ${response.status}`)
      const batch = (await response.json()) as StravaActivity[]
      result.push(...batch.map(toImported))
      if (batch.length < PAGE_SIZE) break
    }
    return result
  }

  async fetchSamples(tokens: IntegrationTokens, externalId: string): Promise<ActivitySample[]> {
    const id = externalId.replace(/^strava:/, '')
    const params = new URLSearchParams({ keys: 'time,distance,altitude,heartrate', key_by_type: 'true' })
    const response = await this.http(`${API}/api/v3/activities/${encodeURIComponent(id)}/streams?${params}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
    // Activité saisie à la main ou sans capteur : pas de flux.
    if (response.status === 404) return []
    if (response.status === 429) throw new RateLimitedError('Strava')
    if (!response.ok) throw new Error(`Strava a répondu ${response.status}`)
    const streams = (await response.json()) as StravaStreams
    const time = streams.time?.data ?? []
    return resampleTrack(
      time.map((t, i) => ({
        t,
        d: streams.distance ? streams.distance.data[i]! / 1000 : undefined,
        alt: streams.altitude?.data[i],
        hr: streams.heartrate?.data[i],
      })),
    )
  }

  private async tokenRequest(body: Record<string, string>): Promise<IntegrationTokens> {
    const response = await this.http(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...body }),
    })
    if (!response.ok) throw new Error(`Échec de l'authentification Strava (${response.status})`)
    const data = (await response.json()) as StravaTokenResponse
    const athlete = [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(' ')
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athleteId: data.athlete?.id ? String(data.athlete.id) : undefined,
      athleteName: athlete || undefined,
    }
  }
}

function toImported(activity: StravaActivity): ImportedActivity {
  return {
    source: 'STRAVA',
    externalId: `strava:${activity.id}`,
    sport: sportFromLabel(activity.sport_type ?? activity.type),
    name: activity.name,
    startTime: new Date(activity.start_date).toISOString(),
    localDate: activity.start_date_local?.slice(0, 10),
    durationSec: activity.moving_time,
    distanceKm: Math.round(activity.distance / 10) / 100,
    elevationGainM: Math.round(activity.total_elevation_gain),
    avgHeartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
    maxHeartRate: activity.max_heartrate ? Math.round(activity.max_heartrate) : undefined,
    profile: [],
  }
}
