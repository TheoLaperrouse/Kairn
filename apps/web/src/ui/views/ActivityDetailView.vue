<script setup lang="ts">
import { ArrowLeft, CalendarCheck, Clock, Heart, MoveUpRight, Route, Trash2, Trophy } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../../application/api-provider'
import { useActivitiesStore } from '../../application/stores/activities'
import { useTrainingStore } from '../../application/stores/training'
import { SPORT_LABELS, formatDate, formatDuration, formatNumber, formatSeconds } from '../../domain/format'
import type { Activity, VamDuration, WorkoutAnalysis } from '../../domain/models'
import ActivityTraceChart from '../components/ActivityTraceChart.vue'
import AnalysisCard from '../components/AnalysisCard.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ElevationProfile from '../components/ElevationProfile.vue'
import ZoneBar from '../components/ZoneBar.vue'

const props = defineProps<{ id: string }>()
const api = useApi()
const store = useActivitiesStore()
const training = useTrainingStore()
const router = useRouter()

const activity = ref<Activity>()
const analysis = ref<WorkoutAnalysis>()
const error = ref('')
const confirming = ref(false)

onMounted(async () => {
  try {
    const [loaded, analyzed] = await Promise.all([api.activity(props.id), api.activityAnalysis(props.id).catch(() => undefined)])
    activity.value = loaded
    analysis.value = analyzed
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Activité introuvable'
  }
})

const vamEfforts = computed(() =>
  ([5, 10, 20, 30] as VamDuration[]).flatMap((minutes) => {
    const effort = analysis.value?.vamCurve[minutes]
    return effort ? [{ ...effort, record: analysis.value!.vamRecords.some((r) => r.minutes === minutes) }] : []
  }),
)

const hasTrace = computed(() => (activity.value?.samples?.length ?? 0) >= 2)

/** Indicateurs secondaires, affichés seulement s'ils ont un sens pour cette sortie. */
const metrics = computed(() => {
  const a = analysis.value
  if (!a) return []
  const list: Array<{ label: string; value: string; sub?: string }> = []
  if (a.ascentVam) list.push({ label: 'VAM en montée', value: `${formatNumber(a.ascentVam)} m/h`, sub: a.vamBaseline ? `habituelle ${formatNumber(a.vamBaseline)} m/h` : undefined })
  if (a.descentSpeed && activity.value?.sport === 'RUN') list.push({ label: 'Vitesse en descente', value: `${formatNumber(a.descentSpeed)} m/h` })
  if (a.decouplingPct !== undefined) list.push({ label: 'Dérive cardiaque', value: `${formatNumber(a.decouplingPct, 1)} %`, sub: a.decouplingPct <= 5 ? 'stable' : 'en hausse' })
  list.push({ label: 'Charge', value: String(a.load), sub: a.plannedLoad ? `prévue ${a.plannedLoad}` : undefined })
  return list
})

const session = computed(() => (activity.value?.plannedSessionId ? training.sessionById(activity.value.plannedSessionId) : undefined))

const pace = computed(() => {
  const a = activity.value
  if (!a || a.sport !== 'RUN' || a.distanceKm <= 0) return undefined
  const secPerKm = a.durationSec / a.distanceKm
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')} /km`
})
const kmEffort = computed(() => (activity.value ? activity.value.distanceKm + activity.value.elevationGainM / 100 : 0))

const SOURCE_LABELS: Record<Activity['source'], string> = {
  FIT: 'Fichier .FIT',
  GPX: 'Fichier .GPX',
  TCX: 'Fichier .TCX',
  STRAVA: 'Strava',
  GARMIN_FOLDER: 'Dossier Garmin',
  MANUAL: 'Saisie manuelle',
}

async function remove() {
  confirming.value = false
  await store.remove(props.id)
  await router.replace('/activites')
}
</script>

<template>
  <div class="page">
    <RouterLink to="/activites" class="btn btn-ghost btn-sm back"><ArrowLeft :size="16" aria-hidden="true" /> Activités</RouterLink>

    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

    <template v-else-if="activity">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ SPORT_LABELS[activity.sport] }} · {{ SOURCE_LABELS[activity.source] }}</p>
          <h1>{{ activity.name }}</h1>
          <p class="lead">{{ formatDate(activity.startTime) }}</p>
        </div>
        <button type="button" class="btn btn-danger btn-sm" @click="confirming = true"><Trash2 :size="16" aria-hidden="true" /> Supprimer</button>
      </header>

      <div class="grid grid-4">
        <div class="card stat">
          <Clock :size="18" aria-hidden="true" />
          <span class="eyebrow">Durée</span>
          <strong class="num">{{ formatSeconds(activity.durationSec) }}</strong>
        </div>
        <div class="card stat">
          <Route :size="18" aria-hidden="true" />
          <span class="eyebrow">Distance</span>
          <strong class="num">{{ formatNumber(activity.distanceKm, 2) }} km</strong>
          <small v-if="pace" class="muted num">{{ pace }}</small>
        </div>
        <div class="card stat">
          <MoveUpRight :size="18" aria-hidden="true" />
          <span class="eyebrow">Dénivelé +</span>
          <strong class="num">{{ formatNumber(activity.elevationGainM) }} m</strong>
          <small v-if="activity.sport === 'RUN'" class="muted num">{{ formatNumber(kmEffort, 1) }} km-effort</small>
        </div>
        <div class="card stat">
          <Heart :size="18" aria-hidden="true" />
          <span class="eyebrow">Fréquence cardiaque</span>
          <strong class="num">{{ activity.avgHeartRate ? `${activity.avgHeartRate} bpm` : '—' }}</strong>
          <small v-if="activity.maxHeartRate" class="muted num">max {{ activity.maxHeartRate }} bpm</small>
        </div>
      </div>

      <dl v-if="metrics.length" class="metrics">
        <div v-for="m in metrics" :key="m.label">
          <dt>{{ m.label }}</dt>
          <dd><strong class="num">{{ m.value }}</strong><small v-if="m.sub" class="muted sub">{{ m.sub }}</small></dd>
        </div>
      </dl>

      <AnalysisCard v-if="analysis" :analysis="analysis" :actual="activity" />

      <section class="card" aria-labelledby="profile-title">
        <div class="card-title"><h2 id="profile-title">{{ hasTrace ? 'Trace' : 'Profil altimétrique' }}</h2></div>
        <ActivityTraceChart v-if="hasTrace" :samples="activity.samples!" :climbs="analysis?.climbs" :zone-bounds="analysis?.zones?.bounds" />
        <ElevationProfile v-else :points="activity.profile" />
      </section>

      <div v-if="analysis?.zones || analysis?.climbs.length" class="grid grid-2">
        <section v-if="analysis.zones" class="card" aria-labelledby="zones-title">
          <div class="card-title">
            <h2 id="zones-title">Zones cardiaques</h2>
            <span class="small muted">{{ analysis.zones.method === 'RESERVE' ? 'FC de réserve' : '% de FC max' }}</span>
          </div>
          <ZoneBar :seconds="analysis.zones.seconds" :target="analysis.comparison?.targetZone" />
        </section>

        <section v-if="analysis.climbs.length" class="card" aria-labelledby="climbs-title">
          <div class="card-title"><h2 id="climbs-title">Montées</h2></div>
          <dl v-if="vamEfforts.length" class="vam-curve" aria-label="Meilleures VAM tenues">
            <div v-for="e in vamEfforts" :key="e.minutes" :class="{ record: e.record }">
              <dt>{{ e.minutes }} min</dt>
              <dd>
                <strong class="num">{{ formatNumber(e.vam) }}</strong> m/h
                <span v-if="e.record" class="record-tag"><Trophy :size="12" aria-hidden="true" /> record</span>
              </dd>
            </div>
          </dl>
          <div class="table-scroll">
            <table class="climbs">
              <thead>
                <tr><th scope="col">#</th><th scope="col">Km</th><th scope="col">D+</th><th scope="col">Pente</th><th scope="col">Durée</th><th scope="col">VAM</th><th scope="col">FC</th></tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in analysis.climbs" :key="i" :class="{ best: analysis.bestClimb?.startKm === c.startKm }">
                  <td><span class="badge num">{{ i + 1 }}</span></td>
                  <td class="num">{{ formatNumber(c.startKm, 1) }}</td>
                  <td class="num">{{ formatNumber(c.elevationM) }} m</td>
                  <td class="num">{{ formatNumber(c.gradePct, 1) }} %</td>
                  <td class="num">{{ formatSeconds(c.durationSec) }}</td>
                  <td class="num"><strong>{{ formatNumber(c.verticalSpeed) }}</strong> m/h</td>
                  <td class="num">{{ c.avgHeartRate ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="analysis.bestClimb" class="small muted">En gras : la VAM, en mètres gravis par heure. Ligne surlignée : ta meilleure montée de plus de 100 m.</p>
        </section>
      </div>

      <section class="card linked" aria-labelledby="session-title">
        <CalendarCheck :size="22" aria-hidden="true" />
        <div>
          <h2 id="session-title">Séance prévue</h2>
          <p v-if="session" class="text-2">
            Rattachée à <RouterLink :to="`/seance/${session.id}`">{{ session.title }}</RouterLink> ({{ formatDuration(session.durationMin) }} prévues), marquée comme réalisée.
          </p>
          <p v-else class="text-2">Aucune séance du plan ne correspondait à ce jour et à ce sport.</p>
        </div>
      </section>

      <ConfirmDialog
        :open="confirming"
        title="Supprimer cette activité ?"
        message="La séance rattachée repassera en « prévue ». Cette action est définitive."
        confirm-label="Supprimer"
        danger
        @confirm="remove"
        @cancel="confirming = false"
      />
    </template>

    <p v-else class="muted">Chargement…</p>
  </div>
</template>

<style scoped>
.metrics {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-3);
}
.metrics div {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.metrics dt {
  font-size: 0.78rem;
  color: var(--muted);
}
.metrics dd {
  margin: 2px 0 0;
}
.metrics strong {
  font-size: 1.15rem;
  font-weight: 600;
}
.metrics .sub {
  display: block;
}
/* Une cellule de grille ne rétrécit pas sous son contenu : sans cela, le tableau des montées élargit la page sur mobile. */
.grid > .card {
  min-width: 0;
}
.vam-curve {
  margin: 0 0 var(--space-3);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--space-2);
}
.vam-curve div {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.vam-curve div.record {
  outline: 1px solid var(--warning);
}
.vam-curve dt {
  font-size: 0.75rem;
  color: var(--muted);
}
.vam-curve dd {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-2);
}
.vam-curve strong {
  font-size: 1.05rem;
  color: var(--text);
}
.record-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text);
}
.record-tag svg {
  color: var(--warning);
}
.table-scroll {
  overflow-x: auto;
}
.climbs {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  white-space: nowrap;
}
.climbs th,
.climbs td {
  padding: 6px 8px;
  text-align: right;
  border-bottom: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
}
.climbs th:first-child,
.climbs td:first-child {
  text-align: left;
}
.climbs thead th {
  color: var(--muted);
  font-weight: 500;
  font-size: 0.78rem;
}
.climbs tr.best td {
  background: var(--teal-soft);
}
.badge {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--teal);
  font-size: 0.72rem;
  font-weight: 700;
}
.back {
  justify-self: start;
}
.stat {
  display: grid;
  gap: 4px;
  align-content: start;
}
.stat svg {
  color: var(--accent);
}
.stat strong {
  font-size: 1.5rem;
  font-weight: 600;
}
.linked {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}
.linked > svg {
  color: var(--teal);
  flex: none;
}
.linked a {
  color: var(--accent);
  font-weight: 600;
}
</style>
