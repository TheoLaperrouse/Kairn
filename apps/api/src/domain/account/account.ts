import { assertDomain } from '../shared/errors'

export interface User {
  id: string
  email: string
  displayName: string
  passwordHash: string
  createdAt: string
}

/**
 * A device session. The token is never stored in plain text:
 * only its hash (`tokenHash`) is persisted.
 */
export interface DeviceSession {
  id: string
  userId: string
  tokenHash: string
  deviceLabel: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
}

export const SESSION_TTL_DAYS = 60
const MIN_PASSWORD_LENGTH = 10

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateCredentials(email: string, password: string): void {
  assertDomain(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)), 'Adresse e-mail invalide')
  assertDomain(password.length >= MIN_PASSWORD_LENGTH, `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères`)
}

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, 'Edge'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
]

/** Readable label from the User-Agent, e.g. "Firefox · Linux". */
export function describeDevice(userAgent: string | undefined): string {
  if (!userAgent) return 'Appareil inconnu'
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? 'Navigateur'
  const os = SYSTEMS.find(([re]) => re.test(userAgent))?.[1] ?? 'OS inconnu'
  return `${browser} · ${os}`
}
