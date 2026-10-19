/** Violation d'une règle métier : l'entrée est invalide du point de vue du domaine. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} introuvable : ${id}`)
    this.name = 'NotFoundError'
  }
}

export function assertDomain(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError(message)
}
