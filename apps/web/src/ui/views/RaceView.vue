<script setup lang="ts">
/**
 * Plan de course construit sur le GPX officiel : profil, temps de passage, barrières horaires,
 * ravitaillement à emporter et réglages du jour J.
 */
import {
  Clock,
  Droplets,
  Flag,
  Moon,
  Mountain,
  Printer,
  RefreshCw,
  Settings2,
  Trash2,
  TriangleAlert,
  Upload,
  Utensils,
} from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRaceCourseStore } from '../../application/stores/race-course'
import { useTrainingStore } from '../../application/stores/training'
import { formatLongDate, formatNumber } from '../../domain/format'
import type { AidStation, CourseSegment, RaceCourseSettings, Split } from '../../domain/models'
import { clockAt, dayLabel, formatHours, formatMargin } from '../../domain/race-time'
import AidStationEditor from '../components/AidStationEditor.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import CourseProfileChart from '../components/CourseProfileChart.vue'
import StatTile from '../components/StatTile.vue'

const store = useRaceCourseStore()
const training = useTrainingStore()

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()
const confirmGoal = ref(false)
const confirmDelete = ref(false)
const savingStations = ref(false)
const savingSettings = ref(false)
const settingsSaved = ref(false)

onMounted(async () => {
  try {
    await store.load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Impossible de charger le plan de course'
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
    error.value = e instanceof Error ? e.message : 'Import impossible'
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
  let date: string | undefined
  if (raceDate) {
    const d = new Date(`${raceDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + time.day)
    date = formatLongDate(d.toISOString().slice(0, 10))
  }
  return { ...time, date }
})

/** Ligne de départ + chaque point de passage, pour les fiches « à emporter ». */
const legs = computed(() =>
  (plan.value?.splits ?? []).map((split, i, all) => ({
    from: i === 0 ? 'Départ' : all[i - 1]!.name,
    split,
  })),
)

function marginTone(split: Split): 'danger' | 'warning' | 'success' | undefined {
  if (split.marginH === undefined) return undefined
  if (split.marginH < 0) return 'danger'
  if (split.marginH < 1) return 'warning'
  return 'success'
}

function marginText(split: Split): string {
  if (split.marginH === undefined || split.cutoffH === undefined) return '—'
  const cutoff = clockAt(course.value!.settings.startTime, split.cutoffH)
  return `${cutoff.clock} ${dayLabel(cutoff.day)} · ${formatMargin(split.marginH)}`
}

const KIND_LABEL: Record<CourseSegment['kind'], string> = { MONTEE: 'Montée', DESCENTE: 'Descente', ROULANT: 'Portion roulante' }

/** Seules les vraies difficultés : au moins 250 m (ou 8 % du dénivelé total) de montée ou de descente. */
const keySegments = computed(() => {
  const threshold = Math.max(250, (course.value?.elevationGainM ?? 0) * 0.08)
  return (plan.value?.segments ?? []).filter(
    (s) => (s.kind === 'MONTEE' && s.gainM >= threshold) || (s.kind === 'DESCENTE' && s.lossM >= threshold) || (s.kind === 'ROULANT' && s.endKm - s.startKm >= 5),
  )
})

function segmentText(s: CourseSegment): string {
  const length = formatNumber(s.endKm - s.startKm, 1)
  if (s.kind === 'MONTEE') return `${KIND_LABEL[s.kind]} de ${formatNumber(s.gainM)} m à ${formatNumber(Math.abs(s.avgGradePct), 0)} % sur ${length} km`
  if (s.kind === 'DESCENTE') return `${KIND_LABEL[s.kind]} de ${formatNumber(s.lossM)} m à ${formatNumber(Math.abs(s.avgGradePct), 0)} % sur ${length} km`
  return `${KIND_LABEL[s.kind]} de ${length} km`
}

// Réglages du jour J (copie locale éditée puis enregistrée).
const settings = reactive<RaceCourseSettings>({ startTime: '06:00', temperatureC: 15, sweat: 'MOYEN', gut: 'PARTIEL', weightKg: 70 })
watch(
  () => course.value?.settings,
  (value) => {
    if (value) Object.assign(settings, value)
  },
  { immediate: true },
)

async function saveSettings() {
  savingSettings.value = true
  settingsSaved.value = false
  error.value = ''
  try {
    await store.update({ settings: { ...settings, weightKg: Number(settings.weightKg), temperatureC: Number(settings.temperatureC) } })
    settingsSaved.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Enregistrement impossible'
  } finally {
    savingSettings.value = false
  }
}

async function saveStations(stations: AidStation[]) {
  savingStations.value = true
  error.value = ''
  try {
    await store.update({ aidStations: stations })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Enregistrement impossible'
  } finally {
    savingStations.value = false
  }
}

async function applyToGoal() {
  confirmGoal.value = false
  busy.value = true
  try {
    await store.applyToGoal()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Mise à jour impossible'
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

    <!-- État vide -->
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

      <section class="card splits-card">
        <div class="card-title">
          <h2>Temps de passage</h2>
          <span class="chip">Départ {{ course.settings.startTime }}</span>
        </div>
        <div class="table-wrap">
          <table class="splits">
            <thead>
              <tr>
                <th scope="col">Point</th>
                <th scope="col" class="r">Km</th>
                <th scope="col" class="r">Section</th>
                <th scope="col" class="r">Durée</th>
                <th scope="col" class="r">Arrivée</th>
                <th scope="col" class="r">Arrêt</th>
                <th scope="col">Barrière · marge</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(split, i) in plan.splits" :key="`${split.name}-${i}`">
                <th scope="row">
                  <span class="dot" :class="{ major: course.aidStations[i]?.major, finish: i === plan.splits.length - 1 }" aria-hidden="true" />
                  {{ split.name }}
                </th>
                <td class="r num">{{ formatNumber(split.km, 1) }}</td>
                <td class="r num muted">+{{ formatNumber(split.legGainM) }} / −{{ formatNumber(split.legLossM) }}</td>
                <td class="r num">{{ formatHours(split.legDurationH) }}</td>
                <td class="r">
                  <span class="num strong">{{ split.clock }}</span>
                  <span class="muted small day">{{ dayLabel(split.day) }}</span>
                  <Moon v-if="split.night" class="moon" :size="14" aria-label="Section de nuit" />
                  <div class="muted small num">{{ formatHours(split.elapsedH) }}</div>
                </td>
                <td class="r num muted">{{ split.stopMin ? `${split.stopMin} min` : '—' }}</td>
                <td>
                  <span v-if="marginTone(split)" class="margin" :class="marginTone(split)">{{ marginText(split) }}</span>
                  <span v-else class="muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ol class="split-cards">
          <li v-for="(split, i) in plan.splits" :key="`c-${split.name}-${i}`" class="split-card">
            <div class="split-head">
              <span class="dot" :class="{ major: course.aidStations[i]?.major, finish: i === plan.splits.length - 1 }" aria-hidden="true" />
              <strong>{{ split.name }}</strong>
              <span class="num muted">km {{ formatNumber(split.km, 1) }}</span>
            </div>
            <div class="split-time">
              <span class="num big">{{ split.clock }}</span>
              <span class="muted">{{ dayLabel(split.day) }}</span>
              <Moon v-if="split.night" class="moon" :size="14" aria-label="Section de nuit" />
              <span class="num muted">· {{ formatHours(split.elapsedH) }} de course</span>
            </div>
            <p class="num muted small">
              Section {{ formatHours(split.legDurationH) }} · +{{ formatNumber(split.legGainM) }} / −{{ formatNumber(split.legLossM) }} m
              <template v-if="split.stopMin"> · arrêt {{ split.stopMin }} min</template>
            </p>
            <span v-if="marginTone(split)" class="margin" :class="marginTone(split)">Barrière {{ marginText(split) }}</span>
          </li>
        </ol>
      </section>

      <section class="carry-section">
        <h2>À emporter par section</h2>
        <div class="grid grid-3">
          <article v-for="(leg, i) in legs" :key="`l${i}`" class="card carry">
            <p class="eyebrow">{{ leg.from }} → {{ leg.split.name }}</p>
            <p class="carry-time num">{{ formatHours(leg.split.legDurationH) }}<Moon v-if="leg.split.night" :size="14" class="moon" aria-label="De nuit" /></p>
            <div class="macros">
              <span><strong class="num">{{ formatNumber(leg.split.nutrition.carbsG) }} g</strong> glucides</span>
              <span><Droplets :size="14" aria-hidden="true" /><strong class="num">{{ formatNumber(leg.split.nutrition.fluidMl / 1000, 1) }} L</strong></span>
              <span><strong class="num">{{ formatNumber(leg.split.nutrition.sodiumMg) }} mg</strong> sodium</span>
            </div>
            <ul class="carry-list">
              <li v-for="item in leg.split.nutrition.carry" :key="item">{{ item }}</li>
            </ul>
          </article>
        </div>
      </section>

      <section v-if="keySegments.length" class="card no-print">
        <h2 class="card-title">Les grandes difficultés</h2>
        <ol class="segments">
          <li v-for="(segment, i) in keySegments" :key="`seg${i}`" :class="`kind-${segment.kind}`">
            <span class="bar" aria-hidden="true" />
            <div>
              <strong>{{ segmentText(segment) }}</strong>
              <p class="muted small num">
                km {{ formatNumber(segment.startKm, 1) }} → {{ formatNumber(segment.endKm, 1) }} · départ après
                {{ formatHours(segment.startElapsedH) }} ({{ clockAt(course.settings.startTime, segment.startElapsedH).clock }})
              </p>
            </div>
            <span class="num duration">{{ formatHours(segment.durationH) }}</span>
          </li>
        </ol>
      </section>

      <details class="card settings no-print">
        <summary><Settings2 :size="18" aria-hidden="true" /> Réglages du jour J et ravitaillements</summary>
        <form class="settings-form" @submit.prevent="saveSettings">
          <label class="field">
            <span>Heure de départ</span>
            <input v-model="settings.startTime" class="input num" type="time" required />
          </label>
          <label class="field">
            <span>Température prévue (°C)</span>
            <input v-model.number="settings.temperatureC" class="input num" type="number" min="-30" max="50" />
          </label>
          <label class="field">
            <span>Transpiration</span>
            <select v-model="settings.sweat" class="select">
              <option value="FAIBLE">Faible</option>
              <option value="MOYEN">Moyenne</option>
              <option value="FORT">Forte</option>
            </select>
          </label>
          <label class="field">
            <span>Intestin entraîné</span>
            <select v-model="settings.gut" class="select">
              <option value="AUCUN">Pas encore (60 g/h)</option>
              <option value="PARTIEL">En partie (75 g/h)</option>
              <option value="ENTRAINE">Oui (90 g/h)</option>
            </select>
          </label>
          <label class="field">
            <span>Poids (kg)</span>
            <input v-model.number="settings.weightKg" class="input num" type="number" min="35" max="150" />
          </label>
          <div class="settings-actions">
            <button type="submit" class="btn btn-primary btn-sm" :disabled="savingSettings">
              {{ savingSettings ? 'Recalcul…' : 'Recalculer le plan' }}
            </button>
            <span v-if="settingsSaved" class="muted small" role="status">Plan recalculé.</span>
          </div>
        </form>
        <h3>Ravitaillements</h3>
        <AidStationEditor
          :stations="course.aidStations"
          :max-km="course.totalDistanceKm"
          :start-time="course.settings.startTime"
          :saving="savingStations"
          @save="saveStations"
        />
      </details>
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
.strong {
  font-weight: 700;
}
.day {
  margin-left: 6px;
}
.stats {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
}
.skeleton {
  color: var(--muted);
  min-height: 160px;
}

/* État vide */
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

/* Temps de passage */
.table-wrap {
  overflow-x: auto;
}
.splits {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}
.splits th,
.splits td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: middle;
}
.splits thead th {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.splits tbody th {
  font-weight: 600;
  white-space: nowrap;
}
.splits .r {
  text-align: right;
  white-space: nowrap;
}
.splits tbody tr:last-child th,
.splits tbody tr:last-child td {
  border-bottom: 0;
}
.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--teal);
  margin-right: 8px;
  vertical-align: middle;
}
.dot.major {
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.dot.finish {
  background: var(--text);
}
.moon {
  color: var(--series-form);
  vertical-align: -2px;
  margin-left: 4px;
}
.margin {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: var(--font-mono);
  white-space: nowrap;
}
.margin.success {
  background: rgb(76 195 138 / 0.14);
  color: var(--success);
}
.margin.warning {
  background: rgb(242 193 78 / 0.16);
  color: var(--warning);
}
.margin.danger {
  background: rgb(240 106 106 / 0.14);
  color: var(--danger);
}
.split-cards {
  display: none;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: var(--space-3);
}
.split-card {
  display: grid;
  gap: 6px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}
.split-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.split-head strong {
  flex: 1;
  min-width: 0;
}
.split-time {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}
.big {
  font-size: 1.4rem;
  font-weight: 700;
}

/* À emporter */
.carry-section {
  display: grid;
  gap: var(--space-3);
}
.carry {
  display: grid;
  gap: var(--space-2);
  align-content: start;
}
.carry-time {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-display);
}
.macros {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.86rem;
  color: var(--text-2);
}
.macros span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.macros strong {
  color: var(--accent);
}
.carry-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-2);
  font-size: 0.88rem;
  display: grid;
  gap: 4px;
}

/* Difficultés */
.segments {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.segments li {
  display: grid;
  grid-template-columns: 6px 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) 0;
}
.segments .bar {
  align-self: stretch;
  border-radius: 3px;
  background: var(--border-strong);
}
.kind-MONTEE .bar {
  background: var(--accent);
}
.kind-DESCENTE .bar {
  background: var(--teal);
}
.duration {
  font-weight: 700;
  white-space: nowrap;
}

/* Réglages */
.settings summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-weight: 650;
  font-size: 1.1rem;
  cursor: pointer;
  list-style: none;
}
.settings summary::-webkit-details-marker {
  display: none;
}
.settings[open] summary {
  margin-bottom: var(--space-4);
}
.settings h3 {
  margin: var(--space-5) 0 var(--space-3);
}
.settings-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: var(--space-3);
  align-items: end;
}
.settings-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

@media (max-width: 760px) {
  .table-wrap {
    display: none;
  }
  .split-cards {
    display: grid;
  }
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
