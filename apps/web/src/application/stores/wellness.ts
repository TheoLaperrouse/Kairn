import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CheckIn, CheckInResult, WellnessOverview } from '../../domain/models'
import { useApi } from '../api-provider'

export const useWellnessStore = defineStore('wellness', () => {
  const api = useApi()
  const overview = ref<WellnessOverview>()

  async function load() {
    overview.value = await api.wellness()
  }

  async function submit(checkIn: CheckIn): Promise<CheckInResult> {
    const result = await api.submitCheckIn(checkIn)
    await load()
    return result
  }

  return { overview, load, submit }
})
