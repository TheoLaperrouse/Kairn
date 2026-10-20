import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  LightenMode,
  PlanAdjustment,
  Unavailability,
  AthleteProfile,
  Dashboard,
  PlannedSession,
  RaceGoal,
  RacePreset,
  SessionStatus,
  TrainingPlan,
} from '../../domain/models'
import { useApi } from '../api-provider'

export const useTrainingStore = defineStore('training', () => {
  const api = useApi()
  const profile = ref<AthleteProfile | null>(null)
  const goal = ref<RaceGoal | null>(null)
  const plan = ref<TrainingPlan | null>(null)
  const dashboard = ref<Dashboard | null>(null)
  const presets = ref<RacePreset[]>([])
  const loaded = ref(false)

  const isOnboarded = computed(() => Boolean(profile.value && goal.value && plan.value))

  async function load(force = false) {
    if (loaded.value && !force) return
    const [p, g, pl] = await Promise.all([api.getProfile(), api.getGoal(), api.getPlan()])
    profile.value = p
    goal.value = g
    plan.value = pl
    loaded.value = true
  }

  async function loadPresets() {
    if (presets.value.length === 0) presets.value = await api.presets()
  }

  async function loadDashboard() {
    dashboard.value = await api.dashboard()
  }

  async function saveProfile(value: AthleteProfile) {
    profile.value = await api.saveProfile(value)
  }

  async function saveGoal(value: RaceGoal) {
    goal.value = await api.saveGoal(value)
  }

  async function generatePlan() {
    plan.value = await api.generatePlan()
    dashboard.value = null
  }

  function sessionById(id: string): PlannedSession | undefined {
    return plan.value?.sessions.find((s) => s.id === id)
  }

  async function updateSession(id: string, change: { status?: SessionStatus; notes?: string }) {
    const updated = await api.updateSession(id, change)
    if (plan.value) {
      plan.value = { ...plan.value, sessions: plan.value.sessions.map((s) => (s.id === id ? updated : s)) }
    }
    if (dashboard.value) {
      dashboard.value = {
        ...dashboard.value,
        weekSessions: dashboard.value.weekSessions.map((s) => (s.id === id ? updated : s)),
      }
    }
    return updated
  }

  /** Rattrape les séances clés manquées (idempotent côté serveur), puis recharge si besoin. */
  async function adaptPlan(): Promise<PlanAdjustment | null> {
    const adjustment = await api.adaptPlan()
    if (adjustment) {
      plan.value = await api.getPlan()
      await loadDashboard()
    }
    return adjustment
  }

  async function declareUnavailability(period: Unavailability) {
    plan.value = await api.declareUnavailability(period)
    dashboard.value = null
    return plan.value.adjustments?.[0]
  }

  async function lightenSession(id: string, mode: LightenMode) {
    const updated = await api.lightenSession(id, mode)
    plan.value = await api.getPlan()
    if (dashboard.value) await loadDashboard()
    return updated
  }

  function reset() {
    profile.value = null
    goal.value = null
    plan.value = null
    dashboard.value = null
    loaded.value = false
  }

  return {
    profile,
    goal,
    plan,
    dashboard,
    presets,
    loaded,
    isOnboarded,
    load,
    loadPresets,
    loadDashboard,
    saveProfile,
    saveGoal,
    generatePlan,
    sessionById,
    updateSession,
    adaptPlan,
    declareUnavailability,
    lightenSession,
    reset,
  }
})
