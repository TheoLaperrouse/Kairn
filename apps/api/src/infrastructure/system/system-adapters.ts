import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import type { Clock, IdGenerator, PasswordHasher, TokenService } from '../../application/ports'

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))),
  )
}

/** Format : `scrypt$N$r$p$selHex$hashHex`. */
export class ScryptPasswordHasher implements PasswordHasher {
  private static readonly N = 16_384
  private static readonly R = 8
  private static readonly P = 1
  private static readonly KEY_LENGTH = 64

  async hash(password: string): Promise<string> {
    const { N, R, P, KEY_LENGTH } = ScryptPasswordHasher
    const salt = randomBytes(16)
    const key = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P })
    return ['scrypt', N, R, P, salt.toString('hex'), key.toString('hex')].join('$')
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [algorithm, n, r, p, saltHex, keyHex] = stored.split('$')
    if (algorithm !== 'scrypt' || !saltHex || !keyHex) return false
    const expected = Buffer.from(keyHex, 'hex')
    const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}

export class RandomTokenService implements TokenService {
  generate(): string {
    return randomBytes(32).toString('base64url')
  }

  digest(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID()
  }
}
