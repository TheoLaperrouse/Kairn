import { isExportable, toWorkoutDefinition } from '../../domain/plan/workout-definition'
import type { PlannedSession } from '../../domain/plan/training-plan'
import { DomainError, NotFoundError } from '../../domain/shared/errors'
import type { PlanRepository, WatchOutbox, WorkoutEncoder } from '../ports'

export interface ExportedWorkout {
  filename: string
  content: Buffer
}

export class WorkoutExportService {
  constructor(
    private readonly plans: PlanRepository,
    private readonly encoder: WorkoutEncoder,
    private readonly outbox: WatchOutbox,
  ) {}

  watchConfigured(): boolean {
    return this.outbox.isConfigured()
  }

  exportSession(userId: string, sessionId: string): ExportedWorkout {
    const session = this.plans.get(userId)?.sessions.find((s) => s.id === sessionId)
    if (!session) throw new NotFoundError('Séance', sessionId)
    return this.encode(session)
  }

  /** Dépose les séances (course et vélo) d'une semaine directement sur la montre. */
  async sendWeekToWatch(userId: string, weekIndex: number): Promise<string[]> {
    if (!this.outbox.isConfigured()) throw new DomainError('Aucune montre configurée sur le serveur (GARMIN_NEWFILES_DIR)')
    const sessions = (this.plans.get(userId)?.sessions ?? []).filter(
      (s) => s.weekIndex === weekIndex && s.status === 'PLANNED' && isExportable(s),
    )
    const sent: string[] = []
    for (const session of sessions) {
      const file = this.encode(session)
      await this.outbox.deliver(file.filename, file.content)
      sent.push(session.title)
    }
    return sent
  }

  async sendSessionToWatch(userId: string, sessionId: string): Promise<void> {
    if (!this.outbox.isConfigured()) throw new DomainError('Aucune montre configurée sur le serveur (GARMIN_NEWFILES_DIR)')
    const file = this.exportSession(userId, sessionId)
    await this.outbox.deliver(file.filename, file.content)
  }

  private encode(session: PlannedSession): ExportedWorkout {
    const content = this.encoder.encode(toWorkoutDefinition(session))
    const slug = session.title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)
    return { filename: `kairn-${session.date}-${slug}.${this.encoder.extension}`, content }
  }
}
