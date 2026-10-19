import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WatchOutbox } from '../../application/ports'

/**
 * Dépose les séances dans le dossier `GARMIN/NewFiles` de la montre montée en USB :
 * à la déconnexion, la montre les intègre à son menu « Entraînements ».
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
