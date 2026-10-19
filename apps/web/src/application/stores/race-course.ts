import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AidStation, RaceCourseSettings, RaceCourseView } from '../../domain/models'
import { useApi } from '../api-provider'
import { useTrainingStore } from './training'

export const useRaceCourseStore = defineStore('race-course', () => {
  const api = useApi()
  const view = ref<RaceCourseView | null>(null)
  const loaded = ref(false)

  async function load() {
    view.value = await api.raceCourse()
    loaded.value = true
  }

  async function upload(file: File) {
    view.value = await api.uploadRaceCourse(file)
  }

  async function update(change: { aidStations?: AidStation[]; settings?: RaceCourseSettings }) {
    view.value = await api.updateRaceCourse(change)
  }

  /** Aligne l'objectif sur le tracé officiel ; le plan d'entraînement est régénéré dans la foulée. */
  async function applyToGoal() {
    await api.applyRaceCourseToGoal()
    const training = useTrainingStore()
    await training.load(true)
    await training.generatePlan()
    await load()
  }

  async function remove() {
    await api.deleteRaceCourse()
    view.value = null
  }

  return { view, loaded, load, upload, update, applyToGoal, remove }
})
