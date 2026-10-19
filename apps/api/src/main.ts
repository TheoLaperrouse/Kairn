/**
 * Racine de composition : le seul endroit qui connaît à la fois les cas d'usage
 * et les adaptateurs concrets. Tout le câblage de l'hexagone se fait ici.
 */
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { AccountService } from './application/use-cases/account-service'
import { ActivityService } from './application/use-cases/activity-service'
import { AnalysisService } from './application/use-cases/analysis-service'
import { CalendarService } from './application/use-cases/calendar-service'
import { NotificationService } from './application/use-cases/notification-service'
import { ProgressService } from './application/use-cases/progress-service'
import { SummaryService } from './application/use-cases/summary-service'
import { ContentService } from './application/use-cases/content-service'
import { DashboardService } from './application/use-cases/dashboard-service'
import { RaceCourseService } from './application/use-cases/race-course-service'
import { WellnessService } from './application/use-cases/wellness-service'
import { WorkoutExportService } from './application/use-cases/workout-export-service'
import { TrainingService } from './application/use-cases/training-service'
import { normalizeEmail } from './domain/account/account'
import { DEFAULT_TIME_ZONE } from './domain/shared/dates'
import { IcsCalendarEncoder } from './infrastructure/calendar/ics-calendar-encoder'
import { StaticContentCatalog } from './infrastructure/catalog/static-catalog'
import { FitWorkoutEncoder } from './infrastructure/fit/fit-workout-encoder'
import { buildServer } from './infrastructure/http/server'
import { FolderWatchOutbox } from './infrastructure/integrations/folder-watch-outbox'
import { GarminFolderWatcher } from './infrastructure/integrations/garmin-folder-watcher'
import { ProviderSyncScheduler } from './infrastructure/integrations/provider-sync-scheduler'
import { StravaActivityProvider } from './infrastructure/integrations/strava-provider'
import { GpxCourseParser } from './infrastructure/parsers/course-gpx-parser'
import { WebPushSender, generateVapidKeys } from './infrastructure/push/web-push-sender'
import { FitActivityParser } from './infrastructure/parsers/fit-parser'
import { GpxActivityParser, TcxActivityParser } from './infrastructure/parsers/xml-track-parsers'
import { openDatabase } from './infrastructure/persistence/database'
import {
  SqliteActivityRepository,
  SqliteCalendarFeedRepository,
  SqliteCheckInRepository,
  SqliteGoalRepository,
  SqliteIntegrationStore,
  SqliteNotificationSettingsRepository,
  SqlitePlanRepository,
  SqliteProfileRepository,
  SqlitePushSubscriptionRepository,
  SqliteRaceCourseRepository,
  SqliteSecretStore,
  SqliteSessionRepository,
  SqliteUserRepository,
} from './infrastructure/persistence/sqlite-repositories'
import { RandomTokenService, ScryptPasswordHasher, SystemClock, UuidGenerator } from './infrastructure/system/system-adapters'

const env = process.env
const production = env.NODE_ENV === 'production'
const port = Number(env.PORT ?? 3000)
const publicUrl = env.PUBLIC_URL ?? `http://localhost:${production ? port : 5173}`

const db = openDatabase(resolve(env.DATABASE_PATH ?? 'data/kairn.db'))
const clock = new SystemClock()
const ids = new UuidGenerator()
const catalog = new StaticContentCatalog()

const users = new SqliteUserRepository(db)
const profiles = new SqliteProfileRepository(db)
const goals = new SqliteGoalRepository(db)
const plans = new SqlitePlanRepository(db)
const activityRepository = new SqliteActivityRepository(db)
const checkIns = new SqliteCheckInRepository(db)
const tokens = new RandomTokenService()
const strava = new StravaActivityProvider({
  clientId: env.STRAVA_CLIENT_ID,
  clientSecret: env.STRAVA_CLIENT_SECRET,
  redirectUri: `${publicUrl}/api/integrations/strava/callback`,
})
// Strava n'appelle que des URL publiques en HTTPS. Le jeton ne sert qu'à la vérification de l'abonnement :
// un nouveau à chaque démarrage suffit.
const stravaWebhook =
  strava.isConfigured() && publicUrl.startsWith('https://') && env.STRAVA_WEBHOOK !== 'off'
    ? { verifyToken: randomBytes(16).toString('hex') }
    : undefined

const analyses = new AnalysisService(activityRepository, plans, profiles)
const summaries = new SummaryService(profiles, goals, plans, activityRepository, checkIns, clock)
// Clés VAPID générées au premier démarrage et conservées en base : les abonnements des téléphones en dépendent.
const pushSender = new WebPushSender({
  privateKey: new SqliteSecretStore(db).getOrCreate('vapid', generateVapidKeys),
  subject: env.VAPID_SUBJECT ?? (publicUrl.startsWith('https://') ? publicUrl : 'mailto:kairn@localhost'),
})
const notificationSettings = new SqliteNotificationSettingsRepository(db)
const notifications = new NotificationService(
  new SqlitePushSubscriptionRepository(db),
  notificationSettings,
  pushSender,
  plans,
  checkIns,
  analyses,
  summaries,
  clock,
  (message) => app.log.warn(message),
)

const services = {
  accounts: new AccountService(users, new SqliteSessionRepository(db), new ScryptPasswordHasher(), tokens, clock, ids),
  training: new TrainingService(profiles, goals, plans, catalog, clock, ids, activityRepository),
  activities: new ActivityService(
    activityRepository,
    plans,
    [new FitActivityParser(), new GpxActivityParser(), new TcxActivityParser()],
    [strava],
    new SqliteIntegrationStore(db),
    clock,
    ids,
    [notifications],
    { timeZoneOf: (userId) => notificationSettings.get(userId)?.settings.timeZone ?? DEFAULT_TIME_ZONE },
  ),
  dashboard: new DashboardService(profiles, goals, plans, activityRepository, clock),
  content: new ContentService(catalog),
  raceCourses: new RaceCourseService(new SqliteRaceCourseRepository(db), goals, profiles, new GpxCourseParser(), clock),
  wellness: new WellnessService(checkIns, plans, clock),
  workouts: new WorkoutExportService(plans, new FitWorkoutEncoder(), new FolderWatchOutbox(env.GARMIN_NEWFILES_DIR)),
  analyses,
  summaries,
  notifications,
  calendar: new CalendarService(new SqliteCalendarFeedRepository(db), plans, goals, tokens, new IcsCalendarEncoder(), clock, publicUrl),
  progress: new ProgressService(activityRepository, clock),
}

const app = await buildServer(services, {
  secureCookies: publicUrl.startsWith('https://'),
  webDist: production ? resolve(import.meta.dirname, '../../web/dist') : undefined,
  logger: true,
  stravaWebhook,
})

if (env.GARMIN_WATCH_DIR && env.GARMIN_WATCH_EMAIL) {
  const owner = users.findByEmail(normalizeEmail(env.GARMIN_WATCH_EMAIL))
  if (owner) {
    new GarminFolderWatcher(services.activities, {
      directory: env.GARMIN_WATCH_DIR,
      userId: owner.id,
      intervalMs: Number(env.GARMIN_WATCH_INTERVAL_S ?? 30) * 1000,
      log: (message) => app.log.info(message),
    }).start()
  } else {
    app.log.warn(`GARMIN_WATCH_EMAIL : aucun compte ${env.GARMIN_WATCH_EMAIL}, surveillance désactivée`)
  }
}

// 0.0.0.0 : accessible depuis les autres appareils du réseau (téléphone, tablette).
await app.listen({ port, host: env.HOST ?? '0.0.0.0' })

// Rappels du matin et bilans du dimanche : vérifiés chaque minute, dans le fuseau de chaque utilisateur.
setInterval(() => void services.notifications.tick(), 60_000)

if (strava.isConfigured()) {
  new ProviderSyncScheduler(services.activities, {
    provider: 'strava',
    intervalMs: Number(env.STRAVA_SYNC_INTERVAL_MIN ?? 30) * 60_000,
    log: (message) => app.log.info(message),
  }).start()
}

if (stravaWebhook) {
  const callbackUrl = `${publicUrl}/api/webhooks/strava`
  strava
    .ensureWebhookSubscription(callbackUrl, stravaWebhook.verifyToken)
    .then((id) => app.log.info(`Notifications Strava actives (abonnement ${id}) → ${callbackUrl}`))
    .catch((error: Error) => app.log.warn(`Notifications Strava indisponibles, synchro périodique seule : ${error.message}`))
}
