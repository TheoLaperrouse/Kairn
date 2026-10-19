import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Activity, ActivityVerdict, ImportOutcome, ProviderStatus } from '../../domain/models'
import { useApi } from '../api-provider'
import { useTrainingStore } from './training'

export const useActivitiesStore = defineStore('activities', () => {
  const api = useApi()
  const items = ref<Activity[]>([])
  const verdicts = ref<Record<string, ActivityVerdict>>({})
  const integrations = ref<ProviderStatus[]>([])
  const lastImport = ref<ImportOutcome[]>([])
  const busy = ref(false)

  async function load() {
    const [list, providers, judged] = await Promise.all([api.activities(), api.integrations(), api.activityVerdicts().catch(() => ({}))])
    items.value = list
    integrations.value = providers
    verdicts.value = judged
  }

  /** Après un import, le plan a pu changer (séances validées) : on le recharge. */
  async function afterImport(outcomes: ImportOutcome[]) {
    lastImport.value = outcomes
    if (outcomes.some((o) => o.status === 'IMPORTED')) {
      await Promise.all([load(), useTrainingStore().load(true)])
    }
    return outcomes
  }

  async function importFiles(files: File[]) {
    busy.value = true
    try {
      return await afterImport(await api.importFiles(files))
    } finally {
      busy.value = false
    }
  }

  async function sync(provider: string) {
    busy.value = true
    try {
      return await afterImport(await api.syncProvider(provider))
    } finally {
      busy.value = false
    }
  }

  async function connect(provider: string) {
    window.location.href = await api.connectUrl(provider)
  }

  async function disconnect(provider: string) {
    await api.disconnectProvider(provider)
    integrations.value = await api.integrations()
  }

  async function remove(id: string) {
    await api.deleteActivity(id)
    items.value = items.value.filter((a) => a.id !== id)
    await useTrainingStore().load(true)
  }

  return { items, verdicts, integrations, lastImport, busy, load, importFiles, sync, connect, disconnect, remove }
})
