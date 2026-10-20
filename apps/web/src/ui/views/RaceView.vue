<script setup lang="ts">
import { Clock, Flag, Mountain, Printer, RefreshCw, Trash2, TriangleAlert, Upload, Utensils } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRaceCourseStore } from '../../application/stores/race-course'
import { useTrainingStore } from '../../application/stores/training'
import { addDaysIso, errorMessage, formatLongDate, formatNumber } from '../../domain/format'
import { clockAt, dayLabel, formatHours } from '../../domain/race-time'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import CourseProfileChart from '../components/CourseProfileChart.vue'
import StatTile from '../components/StatTile.vue'
import RaceCarry from './race/RaceCarry.vue'
import RaceKeySegments from './race/RaceKeySegments.vue'
import RaceSettings from './race/RaceSettings.vue'
import RaceSplits from './race/RaceSplits.vue'

const store = useRaceCourseStore()
const training = useTrainingStore()

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()
const confirmGoal = ref(false)
const confirmDelete = ref(false)

onMounted(async () => {
  try {
    await store.load()
  } catch (e) {
    error.value = errorMessage(e, 'Impossible de charger le plan de course')
  } finally {
    loading.value = false
  }
})

const view = computed(() => store.view)
const course = computed(() => view.value?.course)
const plan = computed(() => view.value?.plan)

async function upload(file: File | undefined) {
  if (!file) return
  error.value = ''
  if (!file.name.toLowerCase().endsWith('.gpx')) {
    error.value = 'Le parcours doit être un fichier .gpx (export du site de la course).'
    return
  }
  busy.value = true
  try {
    await store.upload(file)
  } catch (e) {
    error.value = errorMessage(e, 'Import impossible')
  } finally {
    busy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void upload(event.dataTransfer?.files[0])
}

function onPick(event: Event) {
  void upload((event.target as HTMLInputElement).files?.[0])
}

const arrival = computed(() => {
  if (!course.value || !plan.value) return undefined
  const time = clockAt(course.value.settings.startTime, plan.value.totalH)
  const raceDate = training.goal?.raceDate
  return { ...time, date: raceDate ? formatLongDate(addDaysIso(raceDate, time.day)) : undefined }
})

async function applyToGoal() {
  confirmGoal.value = false
  busy.value = true
  try {
    await store.applyToGoal()
  } catch (e) {
    error.value = errorMessage(e, 'Mise à jour impossible')
  } finally {
    busy.value = false
  }
}

async function remove() {
  confirmDelete.value = false
  await store.remove()
}

function print() {
  window.print()
}
</script>

<template>
  <div class="page race">
    <input ref="fileInput" class="visually-hidden" type="file" accept=".gpx,application/gpx+xml" tabindex="-1" @change="onPick" />

    <header class="page-header">
      <div>
        <p class="eyebrow">Plan de course</p>
        <h1>{{ course?.name ?? 'Ta course, kilomètre par kilomètre' }}</h1>
        <p class="lead">
          <template v-if="course">
            Calculé sur le GPX officiel et ton niveau : temps de passage, barrières horaires et ce qu’il faut emporter entre chaque ravito.
          </template>
          <template v-else>Importe le tracé officiel pour obtenir tes temps de passage, tes marges sur les barrières et ton ravitaillement.</template>
        </p>
      </div>
      <div v-if="course" class="row no-print">
        <button type="button" class="btn" @click="print"><Printer :size="18" /> Imprimer</button>
        <button type="button" class="btn btn-ghost" :disabled="busy" @click="fileInput?.click()"><RefreshCw :size="18" /> Remplacer le GPX</button>
        <button type="button" class="btn btn-ghost btn-icon btn-danger" aria-label="Supprimer le parcours" @click="confirmDelete = true">
          <Trash2 :size="18" />
        </button>
      </div>
    </header>

    <p v-if="error" class="alert alert-error no-print" role="alert"><TriangleAlert :size="18" /> {{ error }}</p>

    <div v-if="loading" class="card skeleton" aria-busy="true">Chargement du plan de course…</div>

    <section
      v-else-if="!course || !plan"
      class="card topo dropzone"
      :class="{ dragging, busy }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="drop-icon"><Mountain :size="34" aria-hidden="true" /></div>
      <h2>Dépose le GPX officiel de ta course</h2>
      <p class="text-2">
        Le GPX de l’organisation contient souvent les ravitos en waypoints : ils seront placés automatiquement. Tu pourras ensuite ajouter
        les barrières horaires du règlement.
      </p>
      <button type="button" class="btn btn-primary" :disabled="busy" @click="fileInput?.click()">
        <Upload :size="18" /> {{ busy ? 'Analyse du parcours…' : 'Choisir un fichier .gpx' }}
      </button>
      <ul class="steps text-2">
        <li><Flag :size="16" aria-hidden="true" /> Temps de passage à chaque ravito, heure par heure</li>
        <li><Clock :size="16" aria-hidden="true" /> Marges sur les barrières horaires</li>
        <li><Utensils :size="16" aria-hidden="true" /> Glucides, eau et sel à emporter par section</li>
      </ul>
    </section>

    <template v-else>
      <div v-if="view?.goalMismatch" class="alert mismatch no-print">
        <TriangleAlert :size="20" aria-hidden="true" />
        <div>
          <strong>Le tracé diffère de ton objectif.</strong>
          <p class="text-2">
            GPX : {{ formatNumber(view.goalMismatch.distanceKm, 1) }} km et {{ formatNumber(view.goalMismatch.elevationGainM) }} m D+
            — objectif : {{ formatNumber(training.goal?.distanceKm ?? 0, 1) }} km et {{ formatNumber(training.goal?.elevationGainM ?? 0) }} m D+.
          </p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="confirmGoal = true">Mettre à jour mon objectif et mon plan</button>
      </div>

      <section class="grid grid-4 stats" aria-label="Chiffres clés du parcours">
        <StatTile label="Distance" :value="formatNumber(course.totalDistanceKm, 1)" unit="km" />
        <StatTile label="Dénivelé" :value="`+${formatNumber(course.elevationGainM)}`" unit="m" :sub="`−${formatNumber(course.elevationLossM)} m en descente`" />
        <StatTile label="Point culminant" :value="formatNumber(course.maxAltitudeM)" unit="m" />
        <StatTile label="Temps estimé" :value="formatHours(plan.totalH)" tone="accent" :sub="`dont ${formatHours(plan.totalH - plan.movingH)} d’arrêts`" />
        <StatTile
          v-if="arrival"
          label="Arrivée prévue"
          :value="arrival.clock"
          tone="teal"
          :sub="arrival.date ? `${dayLabel(arrival.day)} · ${arrival.date}` : dayLabel(arrival.day)"
        />
      </section>

      <section v-if="plan.warnings.length" class="card warnings" aria-label="Points de vigilance">
        <h2 class="card-title">À anticiper</h2>
        <ul>
          <li v-for="warning in plan.warnings" :key="warning"><TriangleAlert :size="16" aria-hidden="true" /> {{ warning }}</li>
        </ul>
      </section>

      <section class="card profile-card">
        <div class="card-title">
          <h2>Profil et temps de passage</h2>
          <span class="muted small">Survole le profil pour voir l’heure prévue</span>
        </div>
        <CourseProfileChart
          :points="course.points"
          :segments="plan.segments"
          :stations="course.aidStations"
          :timeline="plan.timeline"
          :start-time="course.settings.startTime"
        />
      </section>

      <RaceSplits :course="course" :plan="plan" />
      <RaceCarry :splits="plan.splits" />
      <RaceKeySegments :course="course" :plan="plan" />
      <RaceSettings :course="course" @error="error = $event" />
    </template>

    <ConfirmDialog
      :open="confirmGoal"
      title="Mettre à jour l’objectif ?"
      message="La distance, le dénivelé et l’altitude de ton objectif seront alignés sur le GPX officiel, puis ton plan sera régénéré (l’historique est conservé)."
      confirm-label="Mettre à jour"
      @confirm="applyToGoal"
      @cancel="confirmGoal = false"
    />
    <ConfirmDialog
      :open="confirmDelete"
      title="Supprimer le parcours ?"
      message="Le GPX, les ravitaillements et les barrières horaires saisis seront supprimés."
      confirm-label="Supprimer"
      danger
      @confirm="remove"
      @cancel="confirmDelete = false"
    />
  </div>
</template>

<style scoped>
.small {
  font-size: 0.82rem;
}
.stats {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
}
.skeleton {
  color: var(--muted);
  min-height: 160px;
}

.dropzone {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: var(--space-4);
  padding: var(--space-7) var(--space-5);
  border: 2px dashed var(--border-strong);
  transition:
    border-color 0.2s var(--ease),
    background 0.2s var(--ease);
}
.dropzone p {
  max-width: 56ch;
}
.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.dropzone.busy {
  opacity: 0.7;
}
.drop-icon {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
}
.steps {
  list-style: none;
  padding: 0;
  margin: var(--space-2) 0 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2) var(--space-5);
  font-size: 0.88rem;
}
.steps li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mismatch {
  align-items: center;
  flex-wrap: wrap;
}
.mismatch > div {
  flex: 1 1 280px;
}

.warnings ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.warnings li {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  color: var(--text-2);
}
.warnings li svg {
  flex: none;
  margin-top: 3px;
  color: var(--warning);
}
</style>

<style>
@media print {
  .sidebar,
  .topbar,
  .tabbar,
  .race .no-print {
    display: none !important;
  }
  body {
    background: #fff !important;
    color: #000 !important;
  }
  .shell {
    display: block !important;
  }
  .race .card {
    box-shadow: none !important;
    border-color: #bbb !important;
    background: #fff !important;
    break-inside: avoid;
  }
  .race .table-wrap {
    display: block !important;
  }
  .race .split-cards {
    display: none !important;
  }
  .race,
  .race .text-2,
  .race .muted,
  .race .eyebrow {
    color: #222 !important;
  }
}
</style>
