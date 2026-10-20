/** Message à afficher pour une erreur attrapée, avec un repli lisible. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
