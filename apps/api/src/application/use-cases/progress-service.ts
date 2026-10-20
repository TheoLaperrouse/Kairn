import { buildVamProgress, type VamProgress } from '../../domain/analysis/vam-curve'
import { toIsoDate } from '../../domain/shared/dates'
import type { ActivityRepository, Clock } from '../ports'

/** Progress over time, computed on demand from the stored tracks. */
export class ProgressService {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly clock: Clock,
  ) {}

  vam(userId: string, weeks = 26): VamProgress {
    return buildVamProgress(this.activities.list(userId), toIsoDate(this.clock.now()), Math.min(Math.max(weeks, 4), 104))
  }
}
