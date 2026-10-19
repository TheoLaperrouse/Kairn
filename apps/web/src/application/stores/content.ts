import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Exercise, FuelingInput, FuelingPlan, Recipe, RoutineDetail, StrengthRoutine } from '../../domain/models'
import { useApi } from '../api-provider'

/** Contenu éditorial (exercices, routines, recettes) : chargé une fois puis mis en cache. */
export const useContentStore = defineStore('content', () => {
  const api = useApi()
  const exercises = ref<Exercise[]>([])
  const routines = ref<StrengthRoutine[]>([])
  const recipes = ref<Recipe[]>([])
  const routineDetails = new Map<string, RoutineDetail>()

  async function loadExercises() {
    if (exercises.value.length === 0) exercises.value = await api.exercises()
  }

  async function loadRoutines() {
    if (routines.value.length === 0) routines.value = await api.routines()
  }

  async function loadRecipes() {
    if (recipes.value.length === 0) recipes.value = await api.recipes()
  }

  async function routine(id: string): Promise<RoutineDetail> {
    const cached = routineDetails.get(id)
    if (cached) return cached
    const detail = await api.routine(id)
    routineDetails.set(id, detail)
    return detail
  }

  function fuelingPlan(input: FuelingInput): Promise<FuelingPlan> {
    return api.fuelingPlan(input)
  }

  return { exercises, routines, recipes, loadExercises, loadRoutines, loadRecipes, routine, fuelingPlan }
})
