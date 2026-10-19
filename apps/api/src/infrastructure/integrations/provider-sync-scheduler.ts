import type { ActivityService } from '../../application/use-cases/activity-service'

export interface SyncSchedulerOptions {
  provider: string
  intervalMs: number
  log: (message: string) => void
}

/**
 * Synchronisation périodique de tous les comptes connectés à un fournisseur.
 * Filet de sécurité du webhook : rattrape les notifications perdues (serveur éteint, tunnel coupé).
 */
export class ProviderSyncScheduler {
  private timer?: NodeJS.Timeout

  constructor(
    private readonly activities: ActivityService,
    private readonly options: SyncSchedulerOptions,
  ) {}

  start(): void {
    void this.run()
    this.timer = setInterval(() => void this.run(), this.options.intervalMs)
  }

  stop(): void {
    clearInterval(this.timer)
  }

  private async run(): Promise<void> {
    for (const result of await this.activities.syncAll(this.options.provider)) {
      if (result.error) this.options.log(`Synchro ${this.options.provider} en échec : ${result.error}`)
      else if (result.imported > 0) this.options.log(`Synchro ${this.options.provider} : ${result.imported} activité(s) importée(s)`)
    }
  }
}
