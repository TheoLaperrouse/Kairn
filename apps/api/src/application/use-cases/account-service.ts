import {
  SESSION_TTL_DAYS,
  describeDevice,
  normalizeEmail,
  validateCredentials,
  type DeviceSession,
  type User,
} from '../../domain/account/account'
import { DomainError, NotFoundError } from '../../domain/shared/errors'
import type { Clock, IdGenerator, PasswordHasher, SessionRepository, TokenService, UserRepository } from '../ports'

export interface AuthenticatedSession {
  token: string
  user: PublicUser
  expiresAt: string
}

export type PublicUser = Pick<User, 'id' | 'email' | 'displayName'>

export interface DeviceView {
  id: string
  deviceLabel: string
  createdAt: string
  lastSeenAt: string
  current: boolean
}

const INVALID_CREDENTIALS = 'E-mail ou mot de passe incorrect'
/** On ne réécrit `lastSeenAt` qu'au plus une fois par minute. */
const TOUCH_INTERVAL_MS = 60_000

export class AccountService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async register(email: string, password: string, displayName: string, userAgent?: string): Promise<AuthenticatedSession> {
    validateCredentials(email, password)
    const normalized = normalizeEmail(email)
    if (this.users.findByEmail(normalized)) throw new DomainError('Un compte existe déjà avec cet e-mail')
    const user: User = {
      id: this.ids.next(),
      email: normalized,
      displayName: displayName.trim() || normalized.split('@')[0]!,
      passwordHash: await this.hasher.hash(password),
      createdAt: this.clock.now().toISOString(),
    }
    this.users.save(user)
    return this.openSession(user, userAgent)
  }

  async login(email: string, password: string, userAgent?: string): Promise<AuthenticatedSession> {
    const user = this.users.findByEmail(normalizeEmail(email))
    // On vérifie un hash même si le compte n'existe pas, pour ne pas révéler son existence par le temps de réponse.
    const valid = await this.hasher.verify(password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !valid) throw new DomainError(INVALID_CREDENTIALS)
    return this.openSession(user, userAgent)
  }

  /** Résout le jeton d'un cookie en utilisateur, ou `undefined` si la session est invalide/expirée. */
  authenticate(token: string): { user: PublicUser; sessionId: string } | undefined {
    const session = this.sessions.findByTokenHash(this.tokens.digest(token))
    const now = this.clock.now()
    if (!session || session.expiresAt <= now.toISOString()) return undefined
    const user = this.users.findById(session.userId)
    if (!user) return undefined
    if (now.getTime() - Date.parse(session.lastSeenAt) > TOUCH_INTERVAL_MS) {
      this.sessions.touch(session.id, now.toISOString())
    }
    return { user: toPublic(user), sessionId: session.id }
  }

  logout(userId: string, sessionId: string): void {
    this.sessions.delete(userId, sessionId)
  }

  listDevices(userId: string, currentSessionId: string): DeviceView[] {
    this.sessions.deleteExpired(this.clock.now().toISOString())
    return this.sessions
      .listByUser(userId)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .map((s) => ({
        id: s.id,
        deviceLabel: s.deviceLabel,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: s.id === currentSessionId,
      }))
  }

  revokeDevice(userId: string, sessionId: string): void {
    if (!this.sessions.delete(userId, sessionId)) throw new NotFoundError('Session', sessionId)
  }

  private openSession(user: User, userAgent?: string): AuthenticatedSession {
    const now = this.clock.now()
    const token = this.tokens.generate()
    const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000).toISOString()
    const session: DeviceSession = {
      id: this.ids.next(),
      userId: user.id,
      tokenHash: this.tokens.digest(token),
      deviceLabel: describeDevice(userAgent),
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt,
    }
    this.sessions.save(session)
    return { token, user: toPublic(user), expiresAt }
  }
}

/** Hash scrypt d'un mot de passe aléatoire : sert uniquement à égaliser les temps de réponse. */
const DUMMY_HASH = 'scrypt$16384$8$1$0000000000000000$' + '0'.repeat(128)

function toPublic(user: User): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName }
}
