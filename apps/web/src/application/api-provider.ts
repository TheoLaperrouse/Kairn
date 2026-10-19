import type { PushClient } from './ports/push-client'
import type { TrainingApi } from './ports/training-api'

/**
 * Point d'injection de l'adaptateur API : `main.ts` fournit l'implémentation HTTP,
 * les tests peuvent fournir un double en mémoire.
 */
let current: TrainingApi | undefined

export function provideApi(api: TrainingApi): void {
  current = api
}

export function useApi(): TrainingApi {
  if (!current) throw new Error('Aucune implémentation de TrainingApi fournie')
  return current
}

let push: PushClient | undefined

export function providePushClient(client: PushClient): void {
  push = client
}

export function usePushClient(): PushClient {
  if (!push) throw new Error('Aucune implémentation de PushClient fournie')
  return push
}
