import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ActivityProvider, Clock, PushSender, PushSubscription } from '../../src/application/ports'
import { AccountService } from '../../src/application/use-cases/account-service'
import { ActivityService } from '../../src/application/use-cases/activity-service'
import { AnalysisService } from '../../src/application/use-cases/analysis-service'
import { CalendarService } from '../../src/application/use-cases/calendar-service'
import { ContentService } from '../../src/application/use-cases/content-service'
import { NotificationService } from '../../src/application/use-cases/notification-service'
import { ProgressService } from '../../src/application/use-cases/progress-service'
import { SummaryService } from '../../src/application/use-cases/summary-service'
import type { PushMessage } from '../../src/domain/notifications/notification'
import { IcsCalendarEncoder } from '../../src/infrastructure/calendar/ics-calendar-encoder'
import { DashboardService } from '../../src/application/use-cases/dashboard-service'
import { RaceCourseService } from '../../src/application/use-cases/race-course-service'
import { TrainingService } from '../../src/application/use-cases/training-service'
import { WellnessService } from '../../src/application/use-cases/wellness-service'
import { WorkoutExportService } from '../../src/application/use-cases/workout-export-service'
import { StaticContentCatalog } from '../../src/infrastructure/catalog/static-catalog'
import { FitWorkoutEncoder } from '../../src/infrastructure/fit/fit-workout-encoder'
import { buildServer } from '../../src/infrastructure/http/server'
import { FolderWatchOutbox } from '../../src/infrastructure/integrations/folder-watch-outbox'
import { GpxCourseParser } from '../../src/infrastructure/parsers/course-gpx-parser'
import { GpxActivityParser } from '../../src/infrastructure/parsers/xml-track-parsers'
import { openDatabase } from '../../src/infrastructure/persistence/database'
import * as repos from '../../src/infrastructure/persistence/sqlite-repositories'
import { RandomTokenService, ScryptPasswordHasher, UuidGenerator } from '../../src/infrastructure/system/system-adapters'

/** Fake push service: records sent messages; endpoints containing "gone" are expired. */
export class RecordingPushSender implements PushSender {
  readonly sent: Array<{ endpoint: string; message: PushMessage }> = []

  publicKey() {
    return 'BPublicKeyForTests'
  }

  async send(subscription: PushSubscription, message: PushMessage) {
    if (subscription.endpoint.includes('gone')) return 'GONE' as const
    this.sent.push({ endpoint: subscription.endpoint, message })
    return 'SENT' as const
  }
}

/** Full application on an in-memory SQLite database, with a controllable clock. */
export async function buildTestApp(now: Date, options: { providers?: ActivityProvider[]; stravaVerifyToken?: string } = {}) {
  const clock: Clock & { set(date: Date): void } = {
    current: now,
    now() {
      return this.current
    },
    set(date: Date) {
      this.current = date
    },
  } as Clock & { set(date: Date): void; current: Date }
  const db = openDatabase(':memory:')
  const ids = new UuidGenerator()
  const catalog = new StaticContentCatalog()
  const plans = new repos.SqlitePlanRepository(db)
  const profiles = new repos.SqliteProfileRepository(db)
  const goals = new repos.SqliteGoalRepository(db)
  const activities = new repos.SqliteActivityRepository(db)
  const integrations = new repos.SqliteIntegrationStore(db)
  const checkIns = new repos.SqliteCheckInRepository(db)
  const push = new RecordingPushSender()
  const analyses = new AnalysisService(activities, plans, profiles)
  const summaries = new SummaryService(profiles, goals, plans, activities, checkIns, clock)
  const notifications = new NotificationService(
    new repos.SqlitePushSubscriptionRepository(db),
    new repos.SqliteNotificationSettingsRepository(db),
    push,
    plans,
    checkIns,
    analyses,
    summaries,
    clock,
  )
  const activityService = new ActivityService(
    activities,
    plans,
    [new GpxActivityParser()],
    options.providers ?? [],
    integrations,
    clock,
    ids,
    [notifications],
  )
  const watchDir = mkdtempSync(join(tmpdir(), 'kairn-watch-'))
  const app = await buildServer(
    {
      accounts: new AccountService(new repos.SqliteUserRepository(db), new repos.SqliteSessionRepository(db), new ScryptPasswordHasher(), new RandomTokenService(), clock, ids),
      training: new TrainingService(profiles, goals, plans, catalog, clock, ids, activities),
      activities: activityService,
      dashboard: new DashboardService(profiles, goals, plans, activities, clock),
      content: new ContentService(catalog),
      raceCourses: new RaceCourseService(new repos.SqliteRaceCourseRepository(db), goals, profiles, new GpxCourseParser(), clock),
      wellness: new WellnessService(checkIns, plans, clock),
      workouts: new WorkoutExportService(plans, new FitWorkoutEncoder(), new FolderWatchOutbox(watchDir)),
      analyses,
      summaries,
      notifications,
      calendar: new CalendarService(
        new repos.SqliteCalendarFeedRepository(db),
        plans,
        goals,
        new RandomTokenService(),
        new IcsCalendarEncoder(),
        clock,
        'https://kairn.test',
      ),
      progress: new ProgressService(activities, clock),
    },
    {
      secureCookies: false,
      logger: false,
      stravaWebhook: options.stravaVerifyToken ? { verifyToken: options.stravaVerifyToken } : undefined,
    },
  )
  return { app, clock, watchDir, integrations, activityService, notifications, push }
}

export function multipart(field: string, filename: string, content: string, type = 'application/octet-stream') {
  const boundary = '----kairn'
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n${content}\r\n--${boundary}--\r\n`,
  }
}
