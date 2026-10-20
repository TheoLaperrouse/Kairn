<script setup lang="ts">
import { Activity, ArrowLeft, Compass, Check, Clock, Lightbulb, Mountain, RotateCcw, Route, Save, Sparkles, Star, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useApi } from '../../application/api-provider'
import { useTrainingStore } from '../../application/stores/training'
import { errorMessage, formatDate, formatDuration, formatNumber, SESSION_TYPE_LABELS } from '../../domain/format'
import type { Activity as ActivityModel, SessionStatus, WorkoutAnalysis } from '../../domain/models'
import AnalysisCard from '../components/AnalysisCard.vue'
import WatchExport from '../components/WatchExport.vue'
import ZoneBadge from '../components/ZoneBadge.vue'
import { SESSION_ICONS } from '../components/session-icons'
import RoutineCard from './session/RoutineCard.vue'
import WorkoutSteps from './session/WorkoutSteps.vue'

const props = defineProps<{ id: string }>()
const training = useTrainingStore()

const session = computed(() => training.sessionById(props.id))
const notes = ref('')
const saving = ref(false)
const savedNotes = ref(false)
const error = ref<string>()
const api = useApi()
const done = ref<{ activity: ActivityModel; analysis: WorkoutAnalysis }>()

async function reloadAnalysis() {
  if (done.value) done.value = { ...done.value, analysis: await api.activityAnalysis(done.value.activity.id) }
}

// Completed session with a linked activity: its analysis is shown below the status.
watch(
  () => session.value?.activityId,
  async (activityId) => {
    done.value = undefined
    if (!activityId) return
    const [activity, analysis] = await Promise.all([api.activity(activityId), api.activityAnalysis(activityId)]).catch(() => [])
    if (activity && analysis) done.value = { activity, analysis }
  },
  { immediate: true },
)

watch(
  session,
  (s, previous) => {
    if (s && s.id !== previous?.id) notes.value = s.notes ?? ''
  },
  { immediate: true },
)

async function setStatus(status: SessionStatus) {
  if (!session.value) return
  saving.value = true
  error.value = undefined
  try {
    await training.updateSession(session.value.id, { status })
  } catch (e) {
    error.value = errorMessage(e, 'Enregistrement impossible')
  } finally {
    saving.value = false
  }
}

async function saveNotes() {
  if (!session.value) return
  saving.value = true
  try {
    await training.updateSession(session.value.id, { notes: notes.value })
    savedNotes.value = true
    setTimeout(() => (savedNotes.value = false), 2000)
  } catch (e) {
    error.value = errorMessage(e, 'Enregistrement impossible')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <RouterLink to="/plan" class="btn btn-ghost btn-sm back"><ArrowLeft :size="16" /> Plan</RouterLink>

    <div v-if="!session" class="card">
      <p>Séance introuvable.</p>
    </div>

    <template v-else>
      <header class="head topo">
        <span class="head-icon" :class="`sport-${session.sport.toLowerCase()}`" aria-hidden="true">
          <component :is="SESSION_ICONS[session.type]" :size="30" />
        </span>
        <div class="head-text">
          <p class="eyebrow">{{ formatDate(session.date) }} · {{ SESSION_TYPE_LABELS[session.type] }}</p>
          <h1>{{ session.title }}</h1>
          <p class="lead">{{ session.objective }}</p>
          <p v-if="session.purpose" class="purpose"><Compass :size="16" aria-hidden="true" /> {{ session.purpose }}</p>
          <div class="facts">
            <span class="fact"><Clock :size="16" aria-hidden="true" /><strong class="num">{{ formatDuration(session.durationMin) }}</strong></span>
            <span v-if="session.distanceKm" class="fact"><Route :size="16" aria-hidden="true" /><strong class="num">{{ formatNumber(session.distanceKm, 1) }}</strong> km</span>
            <span v-if="session.elevationGainM" class="fact"><Mountain :size="16" aria-hidden="true" /><strong class="num">{{ formatNumber(session.elevationGainM) }}</strong> m D+</span>
            <ZoneBadge v-if="session.sport !== 'STRENGTH'" :zone="session.zone" />
            <span v-if="session.keySession" class="chip chip-accent"><Star :size="12" aria-hidden="true" /> Séance clé</span>
          </div>
        </div>
      </header>

      <p v-if="session.adjustment" class="adjusted" role="note">
        <Sparkles :size="18" aria-hidden="true" class="adjusted-icon" />
        <span>
          <strong>Séance adaptée par Kairn.</strong> {{ session.adjustment }}
          <span v-if="session.originalDate" class="muted"> Prévue initialement le {{ formatDate(session.originalDate) }}.</span>
        </span>
      </p>

      <div class="status-bar card" role="group" aria-label="Statut de la séance">
        <p class="status-text">
          <template v-if="session.status === 'DONE'"><Check :size="18" class="ok" aria-hidden="true" /> Séance faite, bravo !</template>
          <template v-else-if="session.status === 'SKIPPED'"><X :size="18" aria-hidden="true" /> Séance non réalisée</template>
          <template v-else>Séance prévue</template>
        </p>
        <div class="row">
          <RouterLink v-if="session.activityId" :to="`/activites/${session.activityId}`" class="btn btn-sm">
            <Activity :size="16" aria-hidden="true" /> Voir l’activité
          </RouterLink>
          <button v-if="session.status !== 'DONE'" class="btn btn-sm btn-primary" type="button" :disabled="saving" @click="setStatus('DONE')">
            <Check :size="16" aria-hidden="true" /> Fait
          </button>
          <button v-if="session.status === 'PLANNED'" class="btn btn-sm" type="button" :disabled="saving" @click="setStatus('SKIPPED')">
            <X :size="16" aria-hidden="true" /> Pas faite
          </button>
          <button v-if="session.status !== 'PLANNED'" class="btn btn-sm btn-ghost" type="button" :disabled="saving" @click="setStatus('PLANNED')">
            <RotateCcw :size="16" aria-hidden="true" /> Remettre à prévu
          </button>
        </div>
      </div>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

      <AnalysisCard v-if="done" :analysis="done.analysis" :actual="done.activity" @profile-updated="reloadAnalysis" />

      <RoutineCard v-if="session.routineId" :routine-id="session.routineId" :session-id="session.id" />

      <WorkoutSteps :steps="session.steps" />

      <WatchExport v-if="(session.sport === 'RUN' || session.sport === 'BIKE') && session.type !== 'RACE'" :session="session" />

      <div class="grid grid-2">
        <section v-if="session.tips.length" class="card" aria-labelledby="tips-title">
          <h2 id="tips-title" class="section-title">Conseils</h2>
          <ul class="tips">
            <li v-for="tip in session.tips" :key="tip"><Lightbulb :size="17" class="tip-icon" aria-hidden="true" />{{ tip }}</li>
          </ul>
        </section>

        <section class="card" aria-labelledby="notes-title">
          <h2 id="notes-title" class="section-title">Mes notes</h2>
          <label class="field">
            <span class="visually-hidden">Notes sur la séance</span>
            <textarea v-model="notes" class="textarea" maxlength="2000" placeholder="Sensations, météo, nutrition testée, douleurs…" />
          </label>
          <div class="row notes-actions">
            <button class="btn btn-sm" type="button" :disabled="saving || notes === (session.notes ?? '')" @click="saveNotes">
              <Save :size="16" aria-hidden="true" /> Enregistrer
            </button>
            <span v-if="savedNotes" class="saved" role="status"><Check :size="15" /> Enregistré</span>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.adjusted {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--teal-soft);
  border: 1px solid color-mix(in srgb, var(--teal) 30%, transparent);
}
.adjusted-icon {
  flex: none;
  color: var(--teal);
  margin-top: 2px;
}
.back {
  justify-self: start;
}
.head {
  display: flex;
  gap: var(--space-5);
  align-items: flex-start;
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: linear-gradient(160deg, var(--surface), var(--surface-2));
  box-shadow: var(--shadow);
}
.head-icon {
  --tone: var(--teal);
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 15%, transparent);
}
.head-icon.sport-bike {
  --tone: var(--series-form);
}
.head-icon.sport-strength {
  --tone: var(--warning);
}
.head-text {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.lead {
  color: var(--text-2);
  max-width: 62ch;
}
.purpose {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
  max-width: 62ch;
  color: var(--text-2);
  font-size: 0.92rem;
}
.purpose svg {
  flex: none;
  margin-top: 3px;
  color: var(--teal);
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  margin-top: var(--space-2);
}
.fact {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
}
.fact strong {
  color: var(--text);
}
.status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}
.status-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.ok {
  color: var(--success);
}
.section-title {
  margin-bottom: var(--space-4);
}
.tips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}
.tips li {
  display: flex;
  gap: var(--space-2);
  color: var(--text-2);
}
.tip-icon {
  flex: none;
  color: var(--warning);
  margin-top: 2px;
}
.notes-actions {
  margin-top: var(--space-3);
}
.saved {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--success);
  font-size: 0.85rem;
  font-weight: 600;
}
@media (max-width: 600px) {
  .head {
    flex-direction: column;
    padding: var(--space-5);
  }
  .head-icon {
    width: 52px;
    height: 52px;
  }
}
</style>
