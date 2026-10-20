import type { FastifySchemaValidationError } from 'fastify/types/schema'

/** Request part named by Fastify (`dataVar`), as the runner would call it. */
const REQUEST_PARTS: Record<string, string> = {
  body: 'Le formulaire',
  querystring: 'Un paramètre de l’adresse',
  params: 'L’adresse',
  headers: 'Un en-tête de la requête',
}

/** Fastify and multipart errors raised before a route runs, whose own messages are in English. */
const CLIENT_ERROR_MESSAGES: Record<string, string> = {
  FST_ERR_CTP_INVALID_JSON_BODY: 'Données illisibles : le JSON envoyé est invalide',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'Données manquantes : la requête est vide',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'Type de contenu non pris en charge',
  FST_ERR_CTP_BODY_TOO_LARGE: 'Requête trop volumineuse',
  FST_REQ_FILE_TOO_LARGE: 'Fichier trop volumineux (50 Mo maximum)',
  FST_FILES_LIMIT: 'Trop de fichiers à la fois (50 maximum)',
  FST_PARTS_LIMIT: 'Trop de fichiers à la fois (50 maximum)',
  FST_INVALID_MULTIPART_CONTENT_TYPE: 'Envoie le fichier via le formulaire d’import',
}

/** French message for a client error that did not come from our own code, never Fastify's English one. */
export function clientErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === 'FST_ERR_VALIDATION') return error.message
  return (error.code && CLIENT_ERROR_MESSAGES[error.code]) ?? 'Requête invalide'
}

/** French message for a rejected request, shown as is by the app (Ajv only speaks English). */
export function validationMessage(errors: FastifySchemaValidationError[], dataVar: string): string {
  const error = errors[0]
  if (!error) return 'Données invalides'
  const path = error.instancePath.replace(/^\//, '').replace(/\//g, '.')
  const field = path ? `« ${path} »` : (REQUEST_PARTS[dataVar] ?? 'La requête')
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
