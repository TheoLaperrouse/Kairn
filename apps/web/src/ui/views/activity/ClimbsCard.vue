<script setup lang="ts">
import { Trophy } from 'lucide-vue-next'
import { computed } from 'vue'
import { formatNumber, formatSeconds } from '../../../domain/format'
import type { VamDuration, WorkoutAnalysis } from '../../../domain/models'

const props = defineProps<{ analysis: WorkoutAnalysis }>()

const vamEfforts = computed(() =>
  ([5, 10, 20, 30] as VamDuration[]).flatMap((minutes) => {
    const effort = props.analysis.vamCurve[minutes]
    return effort ? [{ ...effort, record: props.analysis.vamRecords.some((r) => r.minutes === minutes) }] : []
  }),
)
</script>

<template>
  <section class="card" aria-labelledby="climbs-title">
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
</template>

<style scoped>
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
</style>
