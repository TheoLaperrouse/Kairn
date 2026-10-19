import { NotFoundError } from '../../domain/shared/errors'
import type { CalendarEncoder, CalendarFeedRepository, Clock, GoalRepository, PlanRepository, TokenService } from '../ports'

/**
 * Abonnement agenda : une URL secrète par utilisateur, lisible sans cookie par Google Agenda
 * ou Apple Calendrier. Régénérer le lien révoque l'ancien.
 */
export class CalendarService {
  constructor(
    private readonly feeds: CalendarFeedRepository,
    private readonly plans: PlanRepository,
    private readonly goals: GoalRepository,
    private readonly tokens: TokenService,
    private readonly encoder: CalendarEncoder,
    private readonly clock: Clock,
    private readonly baseUrl: string,
  ) {}

  feedUrl(userId: string): string {
    let token = this.feeds.tokenOf(userId)
    if (!token) {
      token = this.tokens.generate()
      this.feeds.save(userId, token)
    }
    return this.urlOf(token)
  }

  regenerate(userId: string): string {
    const token = this.tokens.generate()
    this.feeds.save(userId, token)
    return this.urlOf(token)
  }

  render(token: string): string {
    const userId = this.feeds.userOf(token)
    if (!userId) throw new NotFoundError('Agenda', 'lien révoqué ou inconnu')
    const goal = this.goals.get(userId)
    return this.encoder.encode({
      name: goal ? `Kairn · ${goal.name}` : 'Kairn',
      sessions: this.plans.get(userId)?.sessions ?? [],
      goal,
      baseUrl: this.baseUrl,
      generatedAt: this.clock.now(),
    })
  }

  private urlOf(token: string): string {
    return `${this.baseUrl}/api/calendar/${token}.ics`
  }
}
