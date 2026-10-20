import type { Activity } from '../../domain/activity/activity'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  analysisMessage,
  checkInReminderMessage,
  dueWeeklySummary,
  isCheckInReminderDue,
  isMorningDue,
  isValidTimeZone,
  morningMessage,
  normalizeSettings,
  validateNotificationSettings,
  weeklyMessage,
  type NotificationSettings,
  type LatestReadiness,
  type NotificationState,
  type PushMessage,
} from '../../domain/notifications/notification'
import { computeReadiness } from '../../domain/wellness/check-in'
import { addDays, localTime, type IsoDate } from '../../domain/shared/dates'
import { DomainError } from '../../domain/shared/errors'
import type {
  ActivityImportListener,
  CheckInRepository,
  Clock,
  NotificationSettingsRepository,
  PlanRepository,
  PushSender,
  PushSubscription,
  PushSubscriptionRepository,
} from '../ports'
import type { AnalysisService } from './analysis-service'
import type { SummaryService } from './summary-service'

export interface NotificationStatus {
  publicKey: string
  settings: NotificationSettings
  devices: Array<{ endpoint: string; deviceLabel: string; createdAt: string }>
}

/** Beyond this, a synced activity is history: no notification. */
const ANALYSIS_MAX_AGE_MS = 36 * 3600_000

/**
 * Phone notifications: morning reminder on session days, Sunday evening summary,
 * analysis of an outing as soon as it is synced. `tick()` is called every minute.
 */
export class NotificationService implements ActivityImportListener {
  constructor(
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly settingsStore: NotificationSettingsRepository,
    private readonly sender: PushSender,
    private readonly plans: PlanRepository,
    private readonly checkIns: CheckInRepository,
    private readonly analyses: AnalysisService,
    private readonly summaries: SummaryService,
    private readonly clock: Clock,
    private readonly log: (message: string) => void = () => {},
  ) {}

  status(userId: string): NotificationStatus {
    return {
      publicKey: this.sender.publicKey(),
      settings: this.load(userId).settings,
      devices: this.subscriptions.listByUser(userId).map(({ endpoint, deviceLabel, createdAt }) => ({ endpoint, deviceLabel, createdAt })),
    }
  }

  subscribe(userId: string, subscription: PushSubscription, deviceLabel: string, timeZone?: string): NotificationStatus {
    if (!/^https:\/\//.test(subscription.endpoint)) throw new DomainError('Abonnement de notification invalide')
    this.subscriptions.save({ ...subscription, userId, deviceLabel, createdAt: this.clock.now().toISOString() })
    const current = this.settingsStore.get(userId)
    // First device: the phone's time zone becomes the reminders' time zone.
    if (!current && timeZone && isValidTimeZone(timeZone)) {
      this.settingsStore.save(userId, { ...DEFAULT_NOTIFICATION_SETTINGS, timeZone }, {})
    }
    return this.status(userId)
  }

  unsubscribe(userId: string, endpoint: string): NotificationStatus {
    if (this.subscriptions.listByUser(userId).some((s) => s.endpoint === endpoint)) this.subscriptions.delete(endpoint)
    return this.status(userId)
  }

  updateSettings(userId: string, input: Partial<NotificationSettings>): NotificationStatus {
    const settings = normalizeSettings(input)
    validateNotificationSettings(settings)
    this.settingsStore.save(userId, settings, this.load(userId).state)
    return this.status(userId)
  }

  async sendTest(userId: string): Promise<number> {
    const sent = await this.deliver(userId, {
      title: 'Kairn est prêt',
      body: 'Les notifications fonctionnent sur cet appareil. À demain matin pour la séance du jour !',
      url: '/reglages',
      tag: 'test',
    })
    if (sent === 0) throw new DomainError('Aucun appareil n’a pu être joint : réactive les notifications sur ce téléphone')
    return sent
  }

  /** Per-minute job: sends whatever is due to each user, in their time zone. */
  async tick(): Promise<void> {
    const now = this.clock.now()
    for (const userId of this.subscriptions.usersWithSubscriptions()) {
      try {
        await this.tickUser(userId, now)
      } catch (error) {
        this.log(`Notifications for ${userId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  activityImported(userId: string, activity: Activity, automatic: boolean): void {
    if (!automatic || this.clock.now().getTime() - Date.parse(activity.startTime) - activity.durationSec * 1000 > ANALYSIS_MAX_AGE_MS) return
    if (!this.load(userId).settings.analysis.enabled || this.subscriptions.listByUser(userId).length === 0) return
    const analysis = this.analyses.analyzeActivity(userId, activity)
    void this.deliver(userId, analysisMessage(activity, analysis)).catch((error: Error) => this.log(`Analysis notification: ${error.message}`))
  }

  private async tickUser(userId: string, now: Date): Promise<void> {
    const { settings, state } = this.load(userId)
    const local = localTime(now, settings.timeZone)
    const next: NotificationState = { ...state }
    const sessions = () => this.plans.get(userId)?.sessions ?? []
    const notify = async (sent: NotificationState, message: () => PushMessage | undefined) => {
      Object.assign(next, sent)
      this.settingsStore.save(userId, settings, next)
      const built = message()
      if (built) await this.deliver(userId, built)
    }

    if (isMorningDue(settings, state, local)) {
      await notify({ lastMorning: local.date }, () =>
        morningMessage(sessions(), { date: local.date, latest: this.latestReadiness(userId, local.date) }),
      )
    }
    if (isCheckInReminderDue(settings, state, local)) {
      await notify({ lastCheckInReminder: local.date }, () => {
        const done = this.checkIns.listSince(userId, local.date).some((c) => c.date === local.date)
        return done ? undefined : checkInReminderMessage(sessions(), local.date)
      })
    }
    const weekStart = dueWeeklySummary(settings, state, local)
    if (weekStart) {
      await notify({ lastWeekly: weekStart }, () => {
        const summary = this.summaries.weekly(userId, weekStart)
        return summary && (summary.totals.activities > 0 || summary.sessions.planned > 0) ? weeklyMessage(summary) : undefined
      })
    }
  }

  /** Sends to all of the user's devices; forgets those the browser has unsubscribed. */
  private async deliver(userId: string, message: PushMessage): Promise<number> {
    let sent = 0
    for (const subscription of this.subscriptions.listByUser(userId)) {
      try {
        if ((await this.sender.send(subscription, message)) === 'GONE') this.subscriptions.delete(subscription.endpoint)
        else sent++
      } catch (error) {
        this.log(`Notification to ${subscription.deviceLabel}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return sent
  }

  private load(userId: string): { settings: NotificationSettings; state: NotificationState } {
    const stored = this.settingsStore.get(userId)
    return stored ? { settings: normalizeSettings(stored.settings), state: stored.state } : { settings: DEFAULT_NOTIFICATION_SETTINGS, state: {} }
  }

  /** Today's or yesterday's morning check-in, if any. */
  private latestReadiness(userId: string, today: IsoDate): LatestReadiness | undefined {
    const history = this.checkIns.listSince(userId, addDays(today, -16))
    const latest = history.filter((c) => c.date <= today && c.date >= addDays(today, -1)).at(-1)
    if (!latest) return undefined
    const { level, action } = computeReadiness(latest, history.filter((c) => c.date < latest.date))
    return { date: latest.date, level, action }
  }
}
