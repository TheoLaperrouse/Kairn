<script setup lang="ts">
import { Activity, ArrowLeft, Check, Clock, Lightbulb, Mountain, Play, RotateCcw, Route, Save, Sparkles, Star, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useApi } from '../../application/api-provider'
import { useContentStore } from '../../application/stores/content'
import { useTrainingStore } from '../../application/stores/training'
import { SESSION_TYPE_LABELS, formatDate, formatDuration } from '../../domain/format'
import type { Activity as ActivityModel, RoutineDetail, SessionStatus, WorkoutAnalysis, WorkoutStep } from '../../domain/models'
import AnalysisCard from '../components/AnalysisCard.vue'
import ExerciseFigure from '../components/ExerciseFigure.vue'
import WatchExport from '../components/WatchExport.vue'
import ZoneBadge from '../components/ZoneBadge.vue'
import { SESSION_ICONS } from '../components/session-icons'

const props = defineProps<{ id: string }>()
const training = useTrainingStore()
const content = useContentStore()

const session = computed(() => training.sessionById(props.id))
const routine = ref<RoutineDetail>()
const notes = ref('')
const saving = ref(false)
const savedNotes = ref(false)
const error = ref<string>()
const api = useApi()
const done = ref<{ activity: ActivityModel; analysis: WorkoutAnalysis }>()

// Séance faite avec une activité rattachée : son analyse s'affiche sous le statut.
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
  async (s, previous) => {
    if (!s) return
    if (s.id !== previous?.id) notes.value = s.notes ?? ''
    if (s.routineId && routine.value?.id !== s.routineId) {
      routine.value = await content.routine(s.routineId).catch(() => undefined)
    }
  },
  { immediate: true },
)

const STEP_LABELS: Record<WorkoutStep['kind'], string> = {
  ECHAUFFEMENT: 'Échauffement',
  EFFORT: 'Effort',
  RECUP: 'Récupération',
  RETOUR_CALME: 'Retour au calme',
  CONTINU: 'Continu',
}

/** Les étapes EFFORT + RECUP répétées sont présentées ensemble. */
const stepGroups = computed(() => {
  const steps = session.value?.steps ?? []
  const groups: Array<{ steps: WorkoutStep[]; repeat?: number }> = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const next = steps[i + 1]
    if (step.repeat && next?.repeat === step.repeat && next.kind === 'RECUP') {
      groups.push({ steps: [step, next], repeat: step.repeat })
      i++
    } else groups.push({ steps: [step], repeat: step.repeat })
  }
  return groups
})

const exerciseOf = (id: string) => routine.value?.exercises.find((e) => e.id === id)

async function setStatus(status: SessionStatus) {
  if (!session.value) return
  saving.value = true
  error.value = undefined
  try {
    await training.updateSession(session.value.id, { status })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Enregistrement impossible'
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
    error.value = e instanceof Error ? e.message : 'Enregistrement impossible'
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
          <div class="facts">
            <span class="fact"><Clock :size="16" aria-hidden="true" /><strong class="num">{{ formatDuration(session.durationMin) }}</strong></span>
            <span v-if="session.distanceKm" class="fact"><Route :size="16" aria-hidden="true" /><strong class="num">{{ session.distanceKm }}</strong> km</span>
            <span v-if="session.elevationGainM" class="fact"><Mountain :size="16" aria-hidden="true" /><strong class="num">{{ session.elevationGainM }}</strong> m D+</span>
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

      <AnalysisCard v-if="done" :analysis="done.analysis" :actual="done.activity" />

      <section v-if="session.routineId" class="card routine" aria-labelledby="routine-title">
        <div class="card-title">
          <div>
            <h2 id="routine-title">{{ routine?.name ?? 'Routine de renforcement' }}</h2>
            <p v-if="routine" class="text-2 sub">{{ routine.focus }} · {{ formatDuration(routine.durationMin) }}</p>
          </div>
        </div>
        <RouterLink :to="`/renfo/${session.routineId}/guidee?seance=${session.id}`" class="btn btn-primary launch">
          <Play :size="20" aria-hidden="true" /> Lancer la séance guidée
        </RouterLink>
        <p v-if="routine" class="text-2 desc">{{ routine.description }}</p>
        <ol v-if="routine" class="blocks">
          <li v-for="(block, i) in routine.blocks" :key="i" class="block">
            <RouterLink :to="`/exercices/${block.exerciseId}`" class="block-figure" :aria-label="`Voir l’exercice ${exerciseOf(block.exerciseId)?.name ?? ''}`">
              <ExerciseFigure v-if="exerciseOf(block.exerciseId)" :exercise="exerciseOf(block.exerciseId)!" :show-labels="false" />
            </RouterLink>
            <div class="block-info">
              <p class="block-name">{{ exerciseOf(block.exerciseId)?.name ?? block.exerciseId }}</p>
              <p class="block-dose">
                <strong class="num">{{ block.sets }} ×
                  <template v-if="block.reps">{{ block.reps }} rép.</template>
                  <template v-else-if="block.durationSec">{{ block.durationSec }} s</template>
                </strong>
                <span v-if="block.perSide" class="chip">par côté</span>
                <span v-if="block.tempo" class="chip chip-teal">tempo {{ block.tempo }}</span>
                <span class="muted">repos {{ block.restSec }} s</span>
              </p>
              <p v-if="block.notes" class="muted block-notes">{{ block.notes }}</p>
            </div>
          </li>
        </ol>
        <div v-else class="muted">Chargement de la routine…</div>
      </section>

      <section v-if="stepGroups.length" class="card" aria-labelledby="steps-title">
        <h2 id="steps-title" class="section-title">Déroulé</h2>
        <ol class="steps">
          <li v-for="(group, i) in stepGroups" :key="i" class="step-group" :class="{ repeated: group.repeat }">
            <span v-if="group.repeat" class="repeat-badge num">× {{ group.repeat }}</span>
            <div v-for="(step, j) in group.steps" :key="j" class="step" :style="{ '--zone': `var(--zone-${step.zone})` }">
              <span class="step-bar" aria-hidden="true" />
              <div class="step-body">
                <p class="step-head">
                  <span class="step-kind">{{ STEP_LABELS[step.kind] }}</span>
                  <span class="num step-dur">{{ step.durationMin >= 1 ? formatDuration(step.durationMin) : `${Math.round(step.durationMin * 60)} s` }}</span>
                  <ZoneBadge :zone="step.zone" compact />
                </p>
                <p class="step-label">{{ step.label }}</p>
                <p v-if="step.terrain" class="muted step-terrain"><Mountain :size="13" aria-hidden="true" /> {{ step.terrain }}</p>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <WatchExport v-if="(session.sport === 'RUN' || session.sport === 'BIKE') && session.type !== 'COURSE'" :session="session" />

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
.sub {
  font-size: 0.9rem;
  margin-top: 4px;
}
.launch {
  width: 100%;
  min-height: 56px;
  font-size: 1.05rem;
}
.desc {
  margin-top: var(--space-4);
}
.blocks {
  list-style: none;
  margin: var(--space-4) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: var(--space-3);
}
.block {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2);
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.block-figure {
  flex: none;
  width: 92px;
  height: 92px;
  border-radius: 12px;
  background: var(--surface);
  padding: 4px;
}
.block-info {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.block-name {
  font-weight: 650;
}
.block-dose {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 0.85rem;
}
.block-notes {
  font-size: 0.8rem;
}
.section-title {
  margin-bottom: var(--space-4);
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.step-group {
  position: relative;
  display: grid;
  gap: 2px;
}
.step-group.repeated {
  padding: var(--space-2);
  padding-top: 26px;
  border-radius: var(--radius);
  border: 1px dashed var(--border-strong);
}
.repeat-badge {
  position: absolute;
  top: 6px;
  left: 12px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent);
}
.step {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: 12px;
  background: var(--surface-2);
}
.step-bar {
  flex: none;
  width: 4px;
  border-radius: 2px;
  background: var(--zone);
}
.step-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.step-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.step-kind {
  font-weight: 700;
}
.step-dur {
  color: var(--text-2);
  font-size: 0.88rem;
}
.step-label {
  color: var(--text-2);
  font-size: 0.92rem;
}
.step-terrain {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
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
