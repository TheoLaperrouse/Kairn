import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AccountService, PublicUser } from '../../application/use-cases/account-service'
import { SESSION_TTL_DAYS } from '../../domain/account/account'

const SESSION_COOKIE = 'kairn_session'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { user: PublicUser; sessionId: string }
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Connexion requise')
    this.name = 'UnauthorizedError'
  }
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return undefined
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_DAYS * 86_400}`,
  ]
  if (secure) attributes.push('Secure')
  reply.header('Set-Cookie', attributes.join('; '))
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

/** Hook `preHandler` : rattache l'utilisateur à la requête ou renvoie 401. */
export function requireAuth(accounts: AccountService) {
  return async (request: FastifyRequest) => {
    const token = readCookie(request, SESSION_COOKIE)
    const auth = token ? accounts.authenticate(token) : undefined
    if (!auth) throw new UnauthorizedError()
    request.auth = auth
  }
}

export function userId(request: FastifyRequest): string {
  if (!request.auth) throw new UnauthorizedError()
  return request.auth.user.id
}

/**
 * Limiteur de tentatives en mémoire (fenêtre glissante) contre le bourrinage
 * des mots de passe. Suffisant pour une instance unique auto-hébergée.
 */
export class AttemptLimiter {
  private readonly attempts = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const recent = (this.attempts.get(key) ?? []).filter((t) => now - t < this.windowMs)
    this.attempts.set(key, recent)
    return recent.length >= this.max
  }

  record(key: string, now = Date.now()): void {
    this.attempts.set(key, [...(this.attempts.get(key) ?? []), now])
  }

  reset(key: string): void {
    this.attempts.delete(key)
  }
}
