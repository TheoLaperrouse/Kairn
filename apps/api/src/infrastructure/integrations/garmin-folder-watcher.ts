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
 * API-free automatic import: watches a folder containing .FIT files.
 *
 * Typical uses:
 * - the watch plugged in over USB exposes `GARMIN/Activity/` (mass storage mount);
 * - a synced folder (Garmin Express, Syncthing, rclone…) receiving the files.
 *
 * Fingerprint-based deduplication makes repeated scans harmless.
 */
export class GarminFolderWatcher {
  private readonly seen = new Map<string, number>()
  private running = false

  constructor(
    private readonly activities: ActivityService,
    private readonly options: FolderWatcherOptions,
  ) {}

  start(): void {
    this.options.log(`Watching Garmin folder: ${this.options.directory}`)
    void this.scan()
    setInterval(() => void this.scan(), this.options.intervalMs)
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
        if (outcome.status === 'IMPORTED') this.options.log(`Activity imported from ${name}`)
        if (outcome.status === 'FAILED') this.options.log(`Could not import ${name}: ${outcome.reason}`)
      }
    } finally {
      this.running = false
    }
  }
}
