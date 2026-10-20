import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WatchOutbox } from '../../application/ports'

/**
 * Drops sessions into the `GARMIN/NewFiles` folder of the watch mounted over USB:
 * once unplugged, the watch adds them to its "Workouts" menu.
 */
export class FolderWatchOutbox implements WatchOutbox {
  constructor(private readonly directory: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.directory)
  }

  async deliver(filename: string, content: Buffer): Promise<void> {
    if (!this.directory) throw new Error('Dossier de la montre non configuré')
    await mkdir(this.directory, { recursive: true })
    await writeFile(join(this.directory, filename.replace(/[/\\]/g, '_')), content)
  }
}
