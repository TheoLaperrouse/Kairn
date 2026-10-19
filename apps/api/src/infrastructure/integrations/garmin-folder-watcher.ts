import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ActivityService } from '../../application/use-cases/activity-service'

export interface FolderWatcherOptions {
  directory: string
  userId: string
  intervalMs: number
  log: (message: string) => void
}

/**
 * Import automatique « sans API » : surveille un dossier contenant des .FIT.
 *
 * Usages typiques :
 * - la montre branchée en USB expose `GARMIN/Activity/` (montage stockage de masse) ;
 * - un dossier synchronisé (Garmin Express, Syncthing, rclone…) recevant les fichiers.
 *
 * Le dédoublonnage par empreinte rend les passages répétés sans effet.
 */
export class GarminFolderWatcher {
  private timer?: NodeJS.Timeout
  private readonly seen = new Map<string, number>()
  private running = false

  constructor(
    private readonly activities: ActivityService,
    private readonly options: FolderWatcherOptions,
  ) {}

  start(): void {
    this.options.log(`Surveillance du dossier Garmin : ${this.options.directory}`)
    void this.scan()
    this.timer = setInterval(() => void this.scan(), this.options.intervalMs)
  }

  stop(): void {
    clearInterval(this.timer)
  }

  private async scan(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const entries = await readdir(this.options.directory).catch(() => [] as string[])
      for (const name of entries.filter((n) => n.toLowerCase().endsWith('.fit'))) {
        const path = join(this.options.directory, name)
        const { mtimeMs } = await stat(path)
        if (this.seen.get(path) === mtimeMs) continue
        this.seen.set(path, mtimeMs)
        const outcome = await this.activities.importFile(this.options.userId, name, await readFile(path), true)
        if (outcome.status === 'IMPORTED') this.options.log(`Activité importée depuis ${name}`)
        if (outcome.status === 'FAILED') this.options.log(`Import impossible de ${name} : ${outcome.reason}`)
      }
    } finally {
      this.running = false
    }
  }
}
