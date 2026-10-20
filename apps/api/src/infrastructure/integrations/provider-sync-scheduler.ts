import type { ActivityService } from '../../application/use-cases/activity-service'

export interface SyncSchedulerOptions {
  provider: string
  intervalMs: number
  log: (message: string) => void
}

/**
 * Periodic sync of every account connected to a provider.
 * Safety net for the webhook: catches up on lost notifications (server down, tunnel cut).
 */
export class ProviderSyncScheduler {
  constructor(
    private readonly activities: ActivityService,
    private readonly options: SyncSchedulerOptions,
  ) {}

  start(): void {
    void this.run()
    setInterval(() => void this.run(), this.options.intervalMs)
  }

  private async run(): Promise<void> {
    for (const result of await this.activities.syncAll(this.options.provider)) {
      if (result.error) this.options.log(`${this.options.provider} sync failed: ${result.error}`)
      else if (result.imported > 0) this.options.log(`${this.options.provider} sync: ${result.imported} activity(ies) imported`)
    }
  }
}
