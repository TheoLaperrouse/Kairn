import type { PushClient } from './ports/push-client'
import type { TrainingApi } from './ports/training-api'

/**
 * Injection point for the API adapter: `main.ts` provides the HTTP implementation,
 * tests can provide an in-memory double.
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
