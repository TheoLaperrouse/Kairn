<script setup lang="ts">
/** Analyse d'une sortie : verdict, comparaison au plan, constats et conseil pour la suite. */
import { ArrowRight, CircleAlert, CircleCheck, Compass, Feather } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useTrainingStore } from '../../application/stores/training'
import { VERDICT_LABELS, VERDICT_TONES, formatDuration, formatNumber } from '../../domain/format'
import type { WorkoutAnalysis } from '../../domain/models'
import InsightList from './InsightList.vue'

const props = defineProps<{ analysis: WorkoutAnalysis; actual: { distanceKm: number; elevationGainM: number } }>()
const training = useTrainingStore()

const tone = computed(() => VERDICT_TONES[props.analysis.verdict])
const icon = computed(() => (tone.value === 'success' ? CircleCheck : tone.value === 'warning' ? CircleAlert : Compass))

const rows = computed(() => {
  const c = props.analysis.comparison
  if (!c) return []
  // `judged` : écart qui compte dans le verdict. Distance et D+ prévus ne sont que des estimations.
  const list = [{ label: 'Durée', done: formatDuration(c.actualDurationMin), planned: formatDuration(c.plannedDurationMin), ratio: c.actualDurationMin / c.plannedDurationMin, judged: true }]
  if (c.plannedDistanceKm) {
    list.push({ label: 'Distance', done: `${formatNumber(props.actual.distanceKm, 1)} km`, planned: `${formatNumber(c.plannedDistanceKm, 1)} km`, ratio: props.actual.distanceKm / c.plannedDistanceKm, judged: false })
  }
  if (c.plannedElevationM) {
    list.push({ label: 'Dénivelé +', done: `${formatNumber(props.actual.elevationGainM)} m`, planned: `${formatNumber(c.plannedElevationM)} m`, ratio: props.actual.elevationGainM / c.plannedElevationM, judged: false })
  }
  if (c.plannedEffortMin && c.effortMin !== undefined) {
    list.push({ label: `Temps en zone d’effort`, done: `${c.effortMin} min`, planned: `${c.plannedEffortMin} min`, ratio: c.effortMin / c.plannedEffortMin, judged: true })
  }
  if (props.analysis.plannedLoad) {
    list.push({ label: 'Charge', done: String(props.analysis.load), planned: String(props.analysis.plannedLoad), ratio: props.analysis.load / props.analysis.plannedLoad, judged: false })
  }
  return list
})

const nextSession = computed(() => (props.analysis.nextStep?.sessionId ? training.sessionById(props.analysis.nextStep.sessionId) : undefined))
const lightening = ref(false)
const lightened = ref(false)
async function lighten() {
  if (!nextSession.value) return
  lightening.value = true
  try {
    await training.lightenSession(nextSession.value.id, 'ALLEGER')
    lightened.value = true
  } finally {
    lightening.value = false
  }
}
</script>

<template>
  <section class="card analysis" :class="`tone-${tone}`" aria-labelledby="analysis-title">
    <header class="verdict">
      <component :is="icon" :size="26" class="verdict-icon" aria-hidden="true" />
      <div>
        <p class="eyebrow" id="analysis-title">Analyse · {{ VERDICT_LABELS[analysis.verdict] }}</p>
        <p class="headline">{{ analysis.headline }}</p>
      </div>
      <div v-if="analysis.score !== undefined" class="score" :aria-label="`Conformité au plan : ${analysis.score} sur 100`">
        <strong class="num">{{ analysis.score }}</strong><span>/100</span>
      </div>
    </header>

    <table v-if="rows.length" class="compare">
      <caption class="visually-hidden">Réalisé comparé au prévu</caption>
      <thead>
        <tr><th scope="col">Comparé au plan</th><th scope="col">Réalisé</th><th scope="col">Prévu</th><th scope="col"><span class="visually-hidden">Écart</span></th></tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <th scope="row">{{ row.label }}</th>
          <td class="num">{{ row.done }}</td>
          <td class="num muted">{{ row.planned }}</td>
          <td>
            <span class="meter" :aria-label="`${Math.round(row.ratio * 100)} % du prévu`">
              <span class="fill" :class="{ off: row.judged && (row.ratio < 0.75 || row.ratio > 1.3) }" :style="{ width: `${Math.min(row.ratio, 1.5) / 1.5 * 100}%` }" />
              <span class="mark" aria-hidden="true" />
            </span>
            <span class="num pct">{{ Math.round(row.ratio * 100) }} %</span>
          </td>
        </tr>
      </tbody>
    </table>

    <InsightList :insights="analysis.insights" />

    <div v-if="analysis.nextStep" class="next">
      <ArrowRight :size="18" aria-hidden="true" />
      <p>{{ analysis.nextStep.text }}</p>
      <div class="row">
        <button
          v-if="analysis.nextStep.suggestLighten && nextSession?.status === 'PLANNED' && !nextSession.adjustment && !lightened"
          type="button"
          class="btn btn-sm"
          :disabled="lightening"
          @click="lighten"
        >
          <Feather :size="16" aria-hidden="true" /> Alléger cette séance
        </button>
        <span v-if="lightened" class="small muted">Séance allégée.</span>
        <RouterLink v-if="nextSession" :to="`/seance/${nextSession.id}`" class="btn btn-sm btn-ghost">Voir la séance</RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.analysis {
  display: grid;
  gap: var(--space-5);
  border-left: 3px solid var(--border-strong);
}
.tone-success {
  border-left-color: var(--success);
}
.tone-warning {
  border-left-color: var(--warning);
}
.verdict {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-3);
  align-items: start;
}
.tone-success .verdict-icon {
  color: var(--success);
}
.tone-warning .verdict-icon {
  color: var(--warning);
}
.tone-neutral .verdict-icon {
  color: var(--teal);
}
.headline {
  margin: 2px 0 0;
  font-size: 1.08rem;
  font-weight: 600;
  line-height: 1.4;
}
.score {
  font-family: var(--font-display);
  white-space: nowrap;
}
.score strong {
  font-size: 1.9rem;
  font-weight: 600;
}
.score span {
  color: var(--muted);
}
.compare {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.compare th,
.compare td {
  padding: 6px 8px 6px 0;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.compare thead th {
  color: var(--muted);
  font-weight: 500;
  font-size: 0.78rem;
}
.compare tbody th {
  font-weight: 500;
  color: var(--text-2);
}
.compare td:last-child {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.meter {
  position: relative;
  flex: 1;
  min-width: 48px;
  height: 6px;
  border-radius: 3px;
  background: var(--surface-3);
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 3px;
  background: var(--teal);
}
.fill.off {
  background: var(--warning);
}
/* Repère du 100 % (aux deux tiers de la jauge, qui va jusqu'à 150 %). */
.mark {
  position: absolute;
  left: 66.6%;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: var(--text-2);
  border-radius: 1px;
}
.pct {
  width: 3.4em;
  text-align: right;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.next {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--surface-2);
}
.next > svg {
  color: var(--accent);
  margin-top: 2px;
}
.next p {
  margin: 0;
}
.next .row {
  grid-column: 2;
  flex-wrap: wrap;
}
@media (max-width: 560px) {
  .compare thead th:last-child,
  .compare td:last-child .meter {
    display: none;
  }
}
</style>
