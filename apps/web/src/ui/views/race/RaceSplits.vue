<script setup lang="ts">
import { Moon } from 'lucide-vue-next'
import { formatNumber } from '../../../domain/format'
import type { RaceCourse, RacePlan, Split } from '../../../domain/models'
import { clockAt, dayLabel, formatHours, formatMargin } from '../../../domain/race-time'

const props = defineProps<{ course: RaceCourse; plan: RacePlan }>()

function marginTone(split: Split): 'danger' | 'warning' | 'success' | undefined {
  if (split.marginH === undefined) return undefined
  if (split.marginH < 0) return 'danger'
  if (split.marginH < 1) return 'warning'
  return 'success'
}

function marginText(split: Split): string {
  if (split.marginH === undefined || split.cutoffH === undefined) return '—'
  const cutoff = clockAt(props.course.settings.startTime, split.cutoffH)
  return `${cutoff.clock} ${dayLabel(cutoff.day)} · ${formatMargin(split.marginH)}`
}

function dotClass(i: number) {
  return { major: props.course.aidStations[i]?.major, finish: i === props.plan.splits.length - 1 }
}
</script>

<template>
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
              <span class="dot" :class="dotClass(i)" aria-hidden="true" />
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
          <span class="dot" :class="dotClass(i)" aria-hidden="true" />
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

@media (max-width: 760px) {
  .table-wrap {
    display: none;
  }
  .split-cards {
    display: grid;
  }
}
</style>
