<script setup lang="ts">
/**
 * Bilan du matin : formulaire express (< 20 s), puis score de forme, recommandation
 * et possibilité d'alléger la séance du jour en un geste.
 */
import { CircleCheck, HeartPulse, Moon, Pencil, Sun, TriangleAlert } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref } from 'vue'
import { useTrainingStore } from '../../application/stores/training'
import { useWellnessStore } from '../../application/stores/wellness'
import { formatDuration, todayIso } from '../../domain/format'
import type { CheckIn, CheckInResult, LightenMode, ReadinessLevel, Scale } from '../../domain/models'
import ReadinessTrend from './ReadinessTrend.vue'

const wellness = useWellnessStore()
const training = useTrainingStore()

const today = todayIso()
const editing = ref(false)
const submitting = ref(false)
const error = ref<string>()
const lastResult = ref<CheckInResult>()
const applied = ref<string>()
const showMetrics = ref(false)

onMounted(() => {
  wellness.load().catch(() => {
    /* le bilan reste utilisable même si l'historique ne charge pas */
  })
})

const result = computed(() => lastResult.value ?? wellness.overview?.today)
const showForm = computed(() => editing.value || !result.value)

interface ScaleQuestion {
  key: 'sleepQuality' | 'soreness' | 'fatigue' | 'motivation' | 'stress'
  label: string
  low: string
  high: string
  emojis: [string, string, string, string, string]
}

/** Chaque échelle va de 1 à 5 ; les libellés rappellent le sens (bas → haut). */
const QUESTIONS: ScaleQuestion[] = [
  { key: 'sleepQuality', label: 'Qualité du sommeil', low: 'Très mauvaise', high: 'Excellente', emojis: ['😫', '😕', '😐', '🙂', '😴'] },
  { key: 'fatigue', label: 'Fatigue', low: 'En pleine forme', high: 'Épuisé', emojis: ['⚡', '🙂', '😐', '🥱', '🪫'] },
  { key: 'soreness', label: 'Courbatures', low: 'Aucune', high: 'Jambes détruites', emojis: ['🦵', '🙂', '😐', '😣', '🧱'] },
  { key: 'motivation', label: 'Motivation', low: 'Aucune envie', high: 'Au taquet', emojis: ['😶', '😕', '😐', '🙂', '🔥'] },
  { key: 'stress', label: 'Stress', low: 'Serein', high: 'Très stressé', emojis: ['😌', '🙂', '😐', '😬', '🤯'] },
]

function blankForm() {
  const previous = wellness.overview?.today?.checkIn
  return {
    sleepHours: previous?.sleepHours ?? 7.5,
    sleepQuality: previous?.sleepQuality ?? (3 as Scale),
    soreness: previous?.soreness ?? (2 as Scale),
    fatigue: previous?.fatigue ?? (2 as Scale),
    motivation: previous?.motivation ?? (4 as Scale),
    stress: previous?.stress ?? (2 as Scale),
    restingHr: previous?.restingHr as number | undefined,
    hrv: previous?.hrv as number | undefined,
    illnessSymptoms: previous?.illnessSymptoms ?? false,
  }
}

const form = reactive(blankForm())

function startEditing() {
  Object.assign(form, blankForm())
  applied.value = undefined
  editing.value = true
}

function adjustSleep(delta: number) {
  form.sleepHours = Math.min(14, Math.max(0, Math.round((form.sleepHours + delta) * 2) / 2))
}

async function submit() {
  submitting.value = true
  error.value = undefined
  try {
    const checkIn: CheckIn = {
      date: today,
      sleepHours: form.sleepHours,
      sleepQuality: form.sleepQuality,
      soreness: form.soreness,
      fatigue: form.fatigue,
      motivation: form.motivation,
      stress: form.stress,
      illnessSymptoms: form.illnessSymptoms,
      ...(form.restingHr ? { restingHr: Number(form.restingHr) } : {}),
      ...(form.hrv ? { hrv: Number(form.hrv) } : {}),
    }
    lastResult.value = await wellness.submit(checkIn)
    editing.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Impossible d’enregistrer le bilan'
  } finally {
    submitting.value = false
  }
}

const LEVEL: Record<ReadinessLevel, { label: string; color: string }> = {
  VERT: { label: 'Feu vert', color: 'var(--success)' },
  ORANGE: { label: 'Feu orange', color: 'var(--warning)' },
  ROUGE: { label: 'Feu rouge', color: 'var(--danger)' },
}

const RING = 2 * Math.PI * 42
const ringOffset = computed(() => RING * (1 - (result.value?.readiness.score ?? 0) / 100))

const pendingSessions = computed(() =>
  (result.value?.affectedSessions ?? []).filter((s) => {
    const current = training.sessionById(s.id) ?? s
    return current.status === 'PLANNED' && !current.adjustment?.includes('bilan du matin')
  }),
)
const acting = ref(false)

async function lighten(mode: LightenMode) {
  acting.value = true
  error.value = undefined
  try {
    const titles: string[] = []
    for (const session of pendingSessions.value) {
      const updated = await training.lightenSession(session.id, mode)
      titles.push(mode === 'REPOS' ? `« ${session.title} » annulée` : `« ${session.title} » → ${updated.title}, ${formatDuration(updated.durationMin)}`)
    }
    applied.value = titles.join(' · ')
    lastResult.value = result.value ? { ...result.value, affectedSessions: [] } : undefined
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Impossible d’adapter la séance'
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <section class="card checkin" aria-labelledby="checkin-title">
    <div class="card-title">
      <div>
        <h2 id="checkin-title"><Sun :size="18" class="sun" aria-hidden="true" /> Bilan du matin</h2>
        <p v-if="showForm" class="text-2 sub">20 secondes pour adapter ta journée à ta forme réelle.</p>
      </div>
      <button v-if="!showForm" type="button" class="btn btn-ghost btn-sm" @click="startEditing">
        <Pencil :size="15" aria-hidden="true" /> <span>Modifier<span class="hide-sm"> mon bilan</span></span>
      </button>
    </div>

    <form v-if="showForm" class="form" @submit.prevent="submit">
      <div class="sleep">
        <span class="q-label"><Moon :size="16" aria-hidden="true" /> Sommeil</span>
        <div class="stepper" role="group" aria-label="Heures de sommeil">
          <button type="button" class="btn btn-icon btn-sm" aria-label="Moins 30 minutes" @click="adjustSleep(-0.5)">−</button>
          <output class="num sleep-value" aria-live="polite">{{ String(form.sleepHours).replace('.', ',') }} h</output>
          <button type="button" class="btn btn-icon btn-sm" aria-label="Plus 30 minutes" @click="adjustSleep(0.5)">+</button>
        </div>
        <input v-model.number="form.sleepHours" class="slider" type="range" min="3" max="11" step="0.5" aria-label="Heures de sommeil" />
      </div>

      <fieldset v-for="q in QUESTIONS" :key="q.key" class="question">
        <legend class="q-label">{{ q.label }}</legend>
        <div class="scale">
          <button
            v-for="value in [1, 2, 3, 4, 5] as Scale[]"
            :key="value"
            type="button"
            class="pill"
            :aria-pressed="form[q.key] === value"
            :aria-label="`${q.label} : ${value} sur 5`"
            @click="form[q.key] = value"
          >
            <span aria-hidden="true">{{ q.emojis[value - 1] }}</span>
            <span class="pill-num num">{{ value }}</span>
          </button>
        </div>
        <div class="scale-ends"><span>1 · {{ q.low }}</span><span>{{ q.high }} · 5</span></div>
      </fieldset>

      <label class="switch">
        <span>
          <strong>Symptômes de maladie</strong>
          <small class="muted block">Gorge, nez, fièvre, courbatures généralisées…</small>
        </span>
        <input v-model="form.illnessSymptoms" type="checkbox" />
      </label>

      <details class="metrics" :open="showMetrics" @toggle="showMetrics = ($event.target as HTMLDetailsElement).open">
        <summary><HeartPulse :size="16" aria-hidden="true" /> FC de repos et VFC (facultatif)</summary>
        <div class="metrics-grid">
          <label class="field">
            <span>FC de repos (bpm)</span>
            <input v-model.number="form.restingHr" class="input" type="number" inputmode="numeric" min="25" max="120" placeholder="ex. 48" />
          </label>
          <label class="field">
            <span>VFC (rMSSD, ms)</span>
            <input v-model.number="form.hrv" class="input" type="number" inputmode="numeric" min="1" max="300" placeholder="ex. 75" />
          </label>
        </div>
        <small class="muted">Comparées à ta moyenne des 14 derniers jours : la montre les mesure au réveil.</small>
      </details>

      <p v-if="error" class="alert alert-error" role="alert"><TriangleAlert :size="18" aria-hidden="true" /> {{ error }}</p>
      <div class="form-actions">
        <button v-if="editing" type="button" class="btn btn-ghost" @click="editing = false">Annuler</button>
        <button type="submit" class="btn btn-primary" :disabled="submitting">
          {{ submitting ? 'Analyse…' : 'Voir ma forme du jour' }}
        </button>
      </div>
    </form>

    <div v-else-if="result" class="result">
      <div class="score" :style="{ '--level': LEVEL[result.readiness.level].color }">
        <svg viewBox="0 0 100 100" class="ring" aria-hidden="true">
          <circle cx="50" cy="50" r="42" class="ring-bg" />
          <circle cx="50" cy="50" r="42" class="ring-fg" :stroke-dasharray="RING" :stroke-dashoffset="ringOffset" />
        </svg>
        <div class="score-text">
          <span class="num score-value">{{ result.readiness.score }}</span>
          <span class="score-max">/100</span>
        </div>
      </div>

      <div class="verdict">
        <p class="level" :style="{ color: LEVEL[result.readiness.level].color }">
          <span class="level-dot" :style="{ background: LEVEL[result.readiness.level].color }" aria-hidden="true" />
          {{ LEVEL[result.readiness.level].label }}
        </p>
        <p class="message">{{ result.readiness.message }}</p>
        <ul v-if="result.readiness.factors.length" class="factors" aria-label="Ce qui pèse aujourd’hui">
          <li v-for="f in result.readiness.factors.slice(0, 4)" :key="f.label" class="chip">
            {{ f.label }} <span class="num muted">−{{ f.impact }}</span>
          </li>
        </ul>
        <p v-for="a in result.readiness.alerts" :key="a" class="alert"><TriangleAlert :size="18" aria-hidden="true" class="warn" /> {{ a }}</p>

        <div v-if="result.readiness.action !== 'AUCUNE' && pendingSessions.length && !applied" class="actions">
          <p class="text-2 small">
            Séance{{ pendingSessions.length > 1 ? 's' : '' }} du jour :
            <strong>{{ pendingSessions.map((s) => s.title).join(', ') }}</strong>
          </p>
          <div class="row">
            <button type="button" class="btn" :class="{ 'btn-primary': result.readiness.action === 'ALLEGER' }" :disabled="acting" @click="lighten('ALLEGER')">
              Alléger la séance
            </button>
            <button type="button" class="btn" :class="{ 'btn-primary': result.readiness.action === 'REPOS' }" :disabled="acting" @click="lighten('REPOS')">
              Prendre du repos
            </button>
          </div>
        </div>
        <p v-if="applied" class="applied" role="status"><CircleCheck :size="18" aria-hidden="true" /> Plan mis à jour : {{ applied }}</p>
        <p v-if="error" class="alert alert-error" role="alert"><TriangleAlert :size="18" aria-hidden="true" /> {{ error }}</p>
      </div>

      <div class="trend-wrap">
        <p class="eyebrow">28 derniers jours</p>
        <ReadinessTrend :history="wellness.overview?.history ?? []" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.checkin h2 {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.sun {
  color: var(--warning);
}
.sub {
  margin-top: 4px;
  font-size: 0.9rem;
}
.form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: var(--space-4) var(--space-5);
}
.sleep,
.question {
  display: grid;
  gap: 8px;
  align-content: start;
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.q-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-2);
  padding: 0;
}
.stepper {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.stepper .btn-icon {
  width: 34px;
  font-size: 1.2rem;
}
.sleep-value {
  min-width: 70px;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 650;
}
.slider {
  width: 100%;
  accent-color: var(--accent);
}
.scale {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.pill {
  display: grid;
  justify-items: center;
  gap: 1px;
  padding: 6px 0 4px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  font-size: 1.15rem;
  line-height: 1.1;
  transition:
    transform 0.12s var(--ease),
    border-color 0.12s var(--ease),
    background 0.12s var(--ease);
}
.pill:hover {
  border-color: var(--border-strong);
}
.pill:active {
  transform: scale(0.95);
}
.pill[aria-pressed='true'] {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.pill-num {
  font-size: 0.68rem;
  color: var(--muted);
}
.pill[aria-pressed='true'] .pill-num {
  color: var(--accent);
}
.scale-ends {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.72rem;
  color: var(--muted);
}
.block {
  display: block;
}
.switch {
  align-self: start;
}
.metrics {
  align-self: start;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-2);
}
.metrics summary {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-2);
}
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin: var(--space-3) 0 var(--space-2);
}
.form-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.form > .alert {
  grid-column: 1 / -1;
}

.result {
  display: grid;
  grid-template-columns: auto minmax(0, 1.4fr) minmax(220px, 1fr);
  gap: var(--space-5);
  align-items: center;
}
.score {
  position: relative;
  width: 128px;
  height: 128px;
}
.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-bg {
  fill: none;
  stroke: var(--surface-3);
  stroke-width: 9;
}
.ring-fg {
  fill: none;
  stroke: var(--level);
  stroke-width: 9;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.8s var(--ease);
}
.score-text {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
}
.score-value {
  font-size: 2.2rem;
  font-weight: 650;
  line-height: 1;
}
.score-max {
  font-size: 0.75rem;
  color: var(--muted);
}
.verdict {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.level {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 650;
}
.level-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.message {
  color: var(--text);
}
.factors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.warn {
  color: var(--warning);
  flex: none;
}
.actions {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.small {
  font-size: 0.88rem;
}
.applied {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--success);
  font-weight: 550;
}
.trend-wrap {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

@media (max-width: 900px) {
  .result {
    grid-template-columns: auto 1fr;
  }
  .trend-wrap {
    grid-column: 1 / -1;
  }
}
@media (max-width: 520px) {
  .hide-sm {
    display: none;
  }
  .result {
    grid-template-columns: 1fr;
    justify-items: start;
  }
  .score {
    width: 108px;
    height: 108px;
  }
  .metrics-grid {
    grid-template-columns: 1fr;
  }
}
</style>
