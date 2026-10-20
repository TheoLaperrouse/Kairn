import type { FastifySchemaValidationError } from 'fastify/types/schema'

/** French message for a rejected request, shown as is by the app (Ajv only speaks English). */
export function validationMessage(errors: FastifySchemaValidationError[], dataVar: string): string {
  const error = errors[0]
  if (!error) return 'Données invalides'
  const path = error.instancePath.replace(/^\//, '').replace(/\//g, '.')
  const field = path ? `« ${path} »` : dataVar === 'body' ? 'Le formulaire' : `Le paramètre ${dataVar}`
  const params = error.params as Record<string, unknown>
  switch (error.keyword) {
    case 'required':
      return `Champ obligatoire manquant : « ${path ? `${path}.` : ''}${params.missingProperty} »`
    case 'additionalProperties':
      return `Champ inconnu : « ${params.additionalProperty} »`
    case 'enum':
    case 'const':
      return `${field} : valeur non autorisée`
    case 'type':
      return `${field} : type invalide (${params.type} attendu)`
    case 'minimum':
    case 'exclusiveMinimum':
      return `${field} : doit valoir au moins ${params.limit}`
    case 'maximum':
    case 'exclusiveMaximum':
      return `${field} : doit valoir au plus ${params.limit}`
    case 'minLength':
      return `${field} : au moins ${params.limit} caractère(s)`
    case 'maxLength':
      return `${field} : ${params.limit} caractères au maximum`
    case 'minItems':
      return `${field} : au moins ${params.limit} élément(s)`
    case 'maxItems':
      return `${field} : ${params.limit} éléments au maximum`
    case 'pattern':
    case 'format':
      return `${field} : format invalide`
    default:
      return `${field} : valeur invalide`
  }
}
