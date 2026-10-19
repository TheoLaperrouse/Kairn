import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AccountService } from '../../application/use-cases/account-service'
import type { ActivityService, ImportOutcome } from '../../application/use-cases/activity-service'
import type { AnalysisService } from '../../application/use-cases/analysis-service'
import type { CalendarService } from '../../application/use-cases/calendar-service'
import type { NotificationService } from '../../application/use-cases/notification-service'
import type { SummaryService } from '../../application/use-cases/summary-service'
import type { PushSubscription } from '../../application/ports'
import { describeDevice } from '../../domain/account/account'
import type { NotificationSettings } from '../../domain/notifications/notification'
import type { ContentService } from '../../application/use-cases/content-service'
import type { DashboardService } from '../../application/use-cases/dashboard-service'
import type { RaceCourseService } from '../../application/use-cases/race-course-service'
import type { WellnessService } from '../../application/use-cases/wellness-service'
import type { WorkoutExportService } from '../../application/use-cases/workout-export-service'
import type { TrainingService } from '../../application/use-cases/training-service'
import type { AthleteProfile } from '../../domain/athlete/athlete-profile'
import type { RaceGoal } from '../../domain/goal/race-goal'
import type { FuelingInput } from '../../domain/nutrition/race-fueling'
import type { LightenMode, Unavailability } from '../../domain/plan/plan-adapter'
import type { SessionStatus } from '../../domain/plan/training-plan'
import type { AidStation, RaceCourseSettings } from '../../domain/race-course/race-course'
import type { CheckIn } from '../../domain/wellness/check-in'
import type { StravaWebhookEvent } from '../integrations/strava-provider'
import { DomainError, NotFoundError } from '../../domain/shared/errors'
import {
  AttemptLimiter,
  UnauthorizedError,
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  userId,
} from './auth'
import {
  checkInSchema,
  credentialsSchema,
  fuelingSchema,
  goalSchema,
  lightenSchema,
  notificationSettingsSchema,
  profileSchema,
  pushSubscriptionSchema,
  unsubscribeSchema,
  raceCourseUpdateSchema,
  sessionPatchSchema,
  unavailabilitySchema,
} from './schemas'

export interface Services {
  accounts: AccountService
  training: TrainingService
  activities: ActivityService
  dashboard: DashboardService
  content: ContentService
  raceCourses: RaceCourseService
  wellness: WellnessService
  workouts: WorkoutExportService
  analyses: AnalysisService
  summaries: SummaryService
  notifications: NotificationService
  calendar: CalendarService
}

export interface ServerOptions {
  secureCookies: boolean
  /** Dossier du front compilé, servi en production. */
  webDist?: string
  logger: boolean
  /** Notifications Strava : jeton de vérification de l'abonnement (absent = webhook désactivé). */
  stravaWebhook?: { verifyToken: string }
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const OAUTH_STATE_TTL_MS = 10 * 60_000

export async function buildServer(services: Services, options: ServerOptions): Promise<FastifyInstance> {
  // Seul le proxy directement devant l'API (Caddy, cloudflared) est cru : l'IP client est la dernière
  // entrée de X-Forwarded-For, celles qui précèdent peuvent être forgées par le client.
  const app = Fastify({ logger: options.logger, trustProxy: (_address, hop) => hop === 0, bodyLimit: 1024 * 1024 })
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 50 } })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof UnauthorizedError) return reply.status(401).send({ error: error.message })
    if (error instanceof DomainError) return reply.status(400).send({ error: error.message })
    if (error instanceof NotFoundError) return reply.status(404).send({ error: error.message })
    const status = (error as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.status(status).send({ error: (error as Error).message })
    request.log.error(error)
    return reply.status(500).send({ error: 'Erreur interne du serveur' })
  })

  // Sonde de santé publique (supervision, healthcheck Docker).
  app.get('/api/health', async () => ({ ok: true }))

  registerAuthRoutes(app, services.accounts, options.secureCookies)
  if (options.stravaWebhook) registerStravaWebhook(app, services.activities, options.stravaWebhook.verifyToken)
  registerCalendarFeed(app, services.calendar)

  await app.register(async (api) => {
    api.addHook('preHandler', requireAuth(services.accounts))
    registerTrainingRoutes(api, services)
    registerActivityRoutes(api, services.activities)
    registerContentRoutes(api, services.content)
    registerRaceCourseRoutes(api, services.raceCourses)
    registerAdaptationRoutes(api, services)
    registerInsightRoutes(api, services)
    registerNotificationRoutes(api, services.notifications, services.calendar)
  })

  if (options.webDist && existsSync(options.webDist)) {
    await app.register(fastifyStatic, { root: options.webDist, wildcard: false })
    // Application monopage : toute route inconnue hors /api renvoie index.html.
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/') ? reply.status(404).send({ error: 'Route inconnue' }) : reply.sendFile('index.html'),
    )
  }
  return app
}

function registerAuthRoutes(app: FastifyInstance, accounts: AccountService, secure: boolean): void {
  const limiter = new AttemptLimiter(10, 15 * 60_000)
  type Credentials = { email: string; password: string; displayName?: string }

  app.post<{ Body: Credentials }>('/api/auth/register', { schema: { body: credentialsSchema } }, async (request, reply) => {
    const { email, password, displayName = '' } = request.body
    const session = await accounts.register(email, password, displayName, request.headers['user-agent'])
    setSessionCookie(reply, session.token, secure)
    return { user: session.user }
  })

  app.post<{ Body: Credentials }>('/api/auth/login', { schema: { body: credentialsSchema } }, async (request, reply) => {
    const key = `${request.ip}:${request.body.email.toLowerCase()}`
    if (limiter.isBlocked(key)) return reply.status(429).send({ error: 'Trop de tentatives, réessaie dans 15 minutes' })
    try {
      const session = await accounts.login(request.body.email, request.body.password, request.headers['user-agent'])
      limiter.reset(key)
      setSessionCookie(reply, session.token, secure)
      return { user: session.user }
    } catch (error) {
      limiter.record(key)
      throw error
    }
  })

  app.register(async (authed) => {
    authed.addHook('preHandler', requireAuth(accounts))
    authed.get('/api/auth/me', async (request) => ({ user: request.auth!.user }))
    authed.post('/api/auth/logout', async (request, reply) => {
      accounts.logout(userId(request), request.auth!.sessionId)
      clearSessionCookie(reply)
      return { ok: true }
    })
    authed.get('/api/auth/devices', async (request) => accounts.listDevices(userId(request), request.auth!.sessionId))
    authed.delete<{ Params: { id: string } }>('/api/auth/devices/:id', async (request, reply) => {
      accounts.revokeDevice(userId(request), request.params.id)
      if (request.params.id === request.auth!.sessionId) clearSessionCookie(reply)
      return { ok: true }
    })
  })
}

function registerTrainingRoutes(api: FastifyInstance, { training, dashboard }: Services): void {
  api.get('/api/presets', async () => training.presets())

  api.get('/api/profile', async (request) => training.getProfile(userId(request)) ?? null)
  api.put<{ Body: AthleteProfile }>('/api/profile', { schema: { body: profileSchema } }, async (request) =>
    training.saveProfile(userId(request), request.body),
  )

  api.get('/api/goal', async (request) => training.getGoal(userId(request)) ?? null)
  api.put<{ Body: RaceGoal }>('/api/goal', { schema: { body: goalSchema } }, async (request) =>
    training.saveGoal(userId(request), request.body),
  )

  api.get('/api/plan', async (request) => training.getPlan(userId(request)) ?? null)
  api.post('/api/plan/generate', async (request) => training.regeneratePlan(userId(request)))

  api.get<{ Params: { id: string } }>('/api/sessions/:id', async (request) =>
    training.getSession(userId(request), request.params.id),
  )
  api.patch<{ Params: { id: string }; Body: { status?: SessionStatus; notes?: string } }>(
    '/api/sessions/:id',
    { schema: { body: sessionPatchSchema } },
    async (request) => training.updateSession(userId(request), request.params.id, request.body),
  )

  api.get('/api/dashboard', async (request) => dashboard.get(userId(request)) ?? null)
}

function registerActivityRoutes(api: FastifyInstance, activities: ActivityService): void {
  const oauthStates = new Map<string, { userId: string; expires: number }>()

  api.get<{ Querystring: { limit?: string } }>('/api/activities', async (request) =>
    activities.list(userId(request), request.query.limit ? Number(request.query.limit) : undefined),
  )
  api.get<{ Params: { id: string } }>('/api/activities/:id', async (request) =>
    activities.get(userId(request), request.params.id),
  )
  api.delete<{ Params: { id: string } }>('/api/activities/:id', async (request) => {
    activities.delete(userId(request), request.params.id)
    return { ok: true }
  })

  api.post('/api/activities/import', async (request) => {
    const outcomes: ImportOutcome[] = []
    for await (const file of request.files()) {
      outcomes.push(await activities.importFile(userId(request), file.filename, await file.toBuffer()))
    }
    return outcomes
  })

  api.get('/api/integrations', async (request) => activities.providerStatuses(userId(request)))

  api.get<{ Params: { provider: string } }>('/api/integrations/:provider/connect', async (request) => {
    const state = randomBytes(16).toString('hex')
    oauthStates.set(state, { userId: userId(request), expires: Date.now() + OAUTH_STATE_TTL_MS })
    return { url: activities.authorizationUrl(request.params.provider, state) }
  })

  // Le retour OAuth arrive par redirection du navigateur : le cookie de session est présent (SameSite=Lax).
  api.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/integrations/:provider/callback',
    async (request, reply) => {
      const { code, state, error } = request.query
      const pending = state ? oauthStates.get(state) : undefined
      if (state) oauthStates.delete(state)
      const valid = pending && pending.userId === userId(request) && pending.expires > Date.now()
      if (error || !code || !valid) return reply.redirect('/activites?integration=error')
      await activities.connect(userId(request), request.params.provider, code)
      return reply.redirect(`/activites?integration=${encodeURIComponent(request.params.provider)}`)
    },
  )

  api.post<{ Params: { provider: string } }>('/api/integrations/:provider/sync', async (request) =>
    activities.sync(userId(request), request.params.provider),
  )
  api.delete<{ Params: { provider: string } }>('/api/integrations/:provider', async (request) => {
    activities.disconnect(userId(request), request.params.provider)
    return { ok: true }
  })
}

/**
 * Routes publiques appelées par Strava. Une notification ne transporte aucune donnée importée :
 * elle déclenche seulement une synchronisation authentifiée par les jetons OAuth de l'athlète.
 */
function registerStravaWebhook(app: FastifyInstance, activities: ActivityService, verifyToken: string): void {
  app.get<{ Querystring: Record<string, string | undefined> }>('/api/webhooks/strava', async (request, reply) => {
    const query = request.query
    if (query['hub.mode'] !== 'subscribe' || query['hub.verify_token'] !== verifyToken) return reply.status(403).send({ error: 'Jeton invalide' })
    return { 'hub.challenge': query['hub.challenge'] }
  })

  // Strava attend une réponse en moins de 2 s : la synchronisation se poursuit en arrière-plan.
  app.post<{ Body: StravaWebhookEvent }>('/api/webhooks/strava', async (request) => {
    const event = request.body
    const athleteId = event?.owner_id ? String(event.owner_id) : undefined
    if (!athleteId) return { ok: true }
    if (event.object_type === 'athlete' && event.updates?.authorized === 'false') {
      activities.disconnectAthlete('strava', athleteId)
    } else if (event.object_type === 'activity' && event.aspect_type === 'create') {
      void activities.syncAthlete('strava', athleteId).then((results) => {
        for (const result of results) {
          if (result.error) request.log.warn(`Synchro Strava (webhook) en échec : ${result.error}`)
          else request.log.info(`Synchro Strava (webhook) : ${result.imported} activité(s) importée(s)`)
        }
      })
    }
    return { ok: true }
  })
}

function registerInsightRoutes(api: FastifyInstance, { analyses, summaries }: Services): void {
  api.get<{ Params: { id: string } }>('/api/activities/:id/analysis', async (request) =>
    analyses.analyze(userId(request), request.params.id),
  )
  api.get<{ Querystring: { week?: string } }>('/api/summaries/weekly', async (request) =>
    summaries.weekly(userId(request), request.query.week || undefined) ?? null,
  )
}

function registerNotificationRoutes(api: FastifyInstance, notifications: NotificationService, calendar: CalendarService): void {
  api.get('/api/notifications', async (request) => notifications.status(userId(request)))
  api.post<{ Body: { subscription: PushSubscription; timeZone?: string } }>(
    '/api/notifications/subscriptions',
    { schema: { body: pushSubscriptionSchema } },
    async (request) =>
      notifications.subscribe(userId(request), request.body.subscription, describeDevice(request.headers['user-agent']), request.body.timeZone),
  )
  api.post<{ Body: { endpoint: string } }>('/api/notifications/unsubscribe', { schema: { body: unsubscribeSchema } }, async (request) =>
    notifications.unsubscribe(userId(request), request.body.endpoint),
  )
  api.put<{ Body: NotificationSettings }>('/api/notifications/settings', { schema: { body: notificationSettingsSchema } }, async (request) =>
    notifications.updateSettings(userId(request), request.body),
  )
  api.post('/api/notifications/test', async (request) => ({ sent: await notifications.sendTest(userId(request)) }))

  api.get('/api/calendar', async (request) => ({ url: calendar.feedUrl(userId(request)) }))
  api.post('/api/calendar/regenerate', async (request) => ({ url: calendar.regenerate(userId(request)) }))
}

/** Flux iCalendar public : l'agenda le relit sans cookie, le jeton secret de l'URL fait foi. */
function registerCalendarFeed(app: FastifyInstance, calendar: CalendarService): void {
  app.get<{ Params: { file: string } }>('/api/calendar/:file', async (request, reply) => {
    const token = request.params.file.replace(/\.ics$/, '')
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', 'inline; filename="kairn.ics"')
      .header('Cache-Control', 'private, max-age=300')
      .send(calendar.render(token))
  })
}

function registerContentRoutes(api: FastifyInstance, content: ContentService): void {
  api.get('/api/exercises', async () => content.exercises())
  api.get<{ Params: { id: string } }>('/api/exercises/:id', async (request) => content.exercise(request.params.id))
  api.get('/api/routines', async () => content.routines())
  api.get<{ Params: { id: string } }>('/api/routines/:id', async (request) => content.routine(request.params.id))
  api.get('/api/recipes', async () => content.recipes())
  api.post<{ Body: FuelingInput }>('/api/nutrition/fueling', { schema: { body: fuelingSchema } }, async (request) =>
    content.fuelingPlan(request.body),
  )
}

function registerRaceCourseRoutes(api: FastifyInstance, raceCourses: RaceCourseService): void {
  api.get('/api/race-course', async (request) => raceCourses.get(userId(request)) ?? null)
  api.post('/api/race-course', async (request) => {
    const file = await request.file()
    if (!file) throw new DomainError('Aucun fichier reçu')
    if (!file.filename.toLowerCase().endsWith('.gpx')) throw new DomainError('Le parcours doit être un fichier .gpx')
    try {
      return raceCourses.upload(userId(request), await file.toBuffer())
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError(error instanceof Error ? error.message : 'GPX illisible')
    }
  })
  api.put<{ Body: { aidStations?: AidStation[]; settings?: RaceCourseSettings } }>(
    '/api/race-course',
    { schema: { body: raceCourseUpdateSchema } },
    async (request) => raceCourses.update(userId(request), request.body),
  )
  api.post('/api/race-course/apply-to-goal', async (request) => raceCourses.applyToGoal(userId(request)))
  api.delete('/api/race-course', async (request) => {
    raceCourses.delete(userId(request))
    return { ok: true }
  })
}

function registerAdaptationRoutes(api: FastifyInstance, { training, wellness, workouts }: Services): void {
  api.get('/api/wellness', async (request) => wellness.overview(userId(request)))
  api.post<{ Body: CheckIn }>('/api/wellness/check-in', { schema: { body: checkInSchema } }, async (request) =>
    wellness.submit(userId(request), request.body),
  )

  api.post('/api/plan/adapt', async (request) => ({ adjustment: training.adaptPlan(userId(request)) ?? null }))
  api.post<{ Body: Unavailability }>('/api/plan/unavailability', { schema: { body: unavailabilitySchema } }, async (request) =>
    training.declareUnavailability(userId(request), request.body),
  )
  api.post<{ Params: { id: string }; Body: { mode: LightenMode } }>(
    '/api/sessions/:id/lighten',
    { schema: { body: lightenSchema } },
    async (request) => training.lightenSession(userId(request), request.params.id, request.body.mode),
  )

  api.get('/api/watch', async () => ({ configured: workouts.watchConfigured() }))
  api.get<{ Params: { id: string } }>('/api/sessions/:id/workout.fit', async (request, reply) => {
    const file = workouts.exportSession(userId(request), request.params.id)
    return reply
      .header('Content-Type', 'application/vnd.ant.fit')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.content)
  })
  api.post<{ Params: { id: string } }>('/api/sessions/:id/send-to-watch', async (request) => {
    await workouts.sendSessionToWatch(userId(request), request.params.id)
    return { ok: true }
  })
  api.post<{ Params: { index: string } }>('/api/plan/weeks/:index/send-to-watch', async (request) => ({
    sent: await workouts.sendWeekToWatch(userId(request), Number(request.params.index)),
  }))
}
