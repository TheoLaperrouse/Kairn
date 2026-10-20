<script setup lang="ts">
/** Weekly volume: planned (ghost bar) versus completed (solid bar). */
import { computed, ref } from 'vue'
import { PHASE_LABELS, formatNumber, formatShortDate } from '../../domain/format'
import type { TrainingPhase, WeekVolume } from '../../domain/models'
import { PHASE_COLORS } from './phase-colors'
import { pointerX } from './chart'
import { useElementWidth } from './use-element-width'

const props = defineProps<{ volumes: WeekVolume[]; currentWeekIndex?: number }>()

type Metric = 'hours' | 'km' | 'elevation'
const METRICS: Array<{ key: Metric; label: string; unit: string; planned: keyof WeekVolume; actual: keyof WeekVolume }> = [
  { key: 'hours', label: 'Heures', unit: 'h', planned: 'plannedHours', actual: 'actualHours' },
  { key: 'km', label: 'Kilomètres', unit: 'km', planned: 'plannedKm', actual: 'actualKm' },
  { key: 'elevation', label: 'Dénivelé', unit: 'm D+', planned: 'plannedElevationM', actual: 'actualElevationM' },
]
const metric = ref<Metric>('hours')
const current = computed(() => METRICS.find((m) => m.key === metric.value)!)

const host = ref<HTMLElement>()
const width = useElementWidth(host)
const height = 240
const margin = { top: 12, right: 8, bottom: 40, left: 40 }
const innerW = computed(() => width.value - margin.left - margin.right)
const innerH = height - margin.top - margin.bottom

const planned = (w: WeekVolume) => Number(w[current.value.planned])
const actual = (w: WeekVolume) => Number(w[current.value.actual])

const max = computed(() => {
  const m = Math.max(1, ...props.volumes.flatMap((w) => [planned(w), actual(w)]))
  const magnitude = 10 ** Math.floor(Math.log10(m))
  return Math.ceil((m * 1.08) / magnitude) * magnitude
})
const slot = computed(() => innerW.value / Math.max(props.volumes.length, 1))
const barW = computed(() => Math.max(slot.value - 2, 2))
const y = (v: number) => margin.top + innerH * (1 - v / max.value)
const baseline = margin.top + innerH

/** Bar with rounded top corners (4 px), anchored on the baseline. */
function bar(x: number, w: number, value: number): string {
  const top = y(value)
  const h = baseline - top
  if (h <= 0.5) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${baseline} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${baseline} Z`
}

const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max.value * f)))

const phaseBands = computed(() => {
  const bands: Array<{ phase: TrainingPhase; from: number; to: number }> = []
  props.volumes.forEach((w, i) => {
    const lastBand = bands.at(-1)
    if (lastBand && lastBand.phase === w.phase) lastBand.to = i
    else bands.push({ phase: w.phase, from: i, to: i })
  })
  return bands
})

const hover = ref<number>()
function onPointer(event: PointerEvent) {
  const i = Math.floor((pointerX(event, width.value) - margin.left) / slot.value)
  hover.value = i >= 0 && i < props.volumes.length ? i : undefined
}
const hovered = computed(() => (hover.value === undefined ? undefined : props.volumes[hover.value]))
const tooltipLeft = computed(() =>
  hover.value === undefined ? 0 : Math.min(Math.max(margin.left + hover.value * slot.value - 80, 0), width.value - 190),
)
const fmt = (v: number) => (metric.value === 'hours' ? formatNumber(v, 1) : formatNumber(v))
</script>

<template>
  <figure class="chart">
    <div class="controls">
      <div class="row" role="group" aria-label="Mesure affichée">
        <button
          v-for="m in METRICS"
          :key="m.key"
          type="button"
          class="chip chip-toggle"
          :aria-pressed="metric === m.key"
          @click="metric = m.key"
        >
          {{ m.label }}
        </button>
      </div>
      <figcaption class="legend">
        <span class="legend-item"><span class="sw planned" aria-hidden="true" /> Prévu</span>
        <span class="legend-item"><span class="sw actual" aria-hidden="true" /> Réalisé</span>
      </figcaption>
    </div>

    <div ref="host" class="plot">
      <svg :width="width" :height="height" aria-hidden="true" @pointermove="onPointer" @pointerdown="onPointer" @pointerleave="hover = undefined">
        <g class="grid">
          <g v-for="t in ticks" :key="t">
            <line :x1="margin.left" :x2="width - margin.right" :y1="y(t)" :y2="y(t)" />
            <text :x="margin.left - 6" :y="y(t)" text-anchor="end" dominant-baseline="middle">{{ fmt(t) }}</text>
          </g>
        </g>

        <rect
          v-if="currentWeekIndex !== undefined && currentWeekIndex < volumes.length"
          class="current"
          :x="margin.left + currentWeekIndex * slot"
          :y="margin.top"
          :width="slot"
          :height="innerH"
          rx="4"
        />

        <g v-for="(w, i) in volumes" :key="w.weekIndex" :class="{ dim: hover !== undefined && hover !== i }" class="week">
          <path class="planned" :class="{ recovery: w.isRecovery }" :d="bar(margin.left + i * slot + 1, barW, planned(w))" />
          <path class="actual" :d="bar(margin.left + i * slot + 1 + barW * 0.18, barW * 0.64, actual(w))" />
        </g>

        <g class="phases">
          <g v-for="b in phaseBands" :key="`${b.phase}-${b.from}`">
            <rect :x="margin.left + b.from * slot + 1" :y="baseline + 8" :width="(b.to - b.from + 1) * slot - 2" height="5" rx="2.5" :style="{ fill: PHASE_COLORS[b.phase] }" />
            <text
              v-if="(b.to - b.from + 1) * slot > 70"
              :x="margin.left + b.from * slot + 2"
              :y="baseline + 28"
            >
              {{ PHASE_LABELS[b.phase] }}
            </text>
          </g>
        </g>
        <rect class="hit" :x="margin.left" y="0" :width="innerW" :height="height" />
      </svg>

      <div v-if="hovered" class="tooltip" :style="{ left: `${tooltipLeft}px` }" role="status">
        <p class="tt-title">
          Semaine du {{ formatShortDate(hovered.startDate) }}
        </p>
        <p class="muted">{{ PHASE_LABELS[hovered.phase] }}{{ hovered.isRecovery ? ' · récupération' : '' }}</p>
        <p class="tt-row"><span class="sw planned" /> Prévu <strong class="num">{{ fmt(planned(hovered)) }} {{ current.unit }}</strong></p>
        <p class="tt-row"><span class="sw actual" /> Réalisé <strong class="num">{{ fmt(actual(hovered)) }} {{ current.unit }}</strong></p>
      </div>
    </div>

    <div class="visually-hidden">
      <table>
        <caption>Volume hebdomadaire prévu et réalisé ({{ current.label }})</caption>
        <thead><tr><th>Semaine</th><th>Phase</th><th>Prévu</th><th>Réalisé</th></tr></thead>
        <tbody>
          <tr v-for="w in volumes" :key="w.weekIndex">
            <td>{{ w.startDate }}</td><td>{{ PHASE_LABELS[w.phase] }}</td><td>{{ planned(w) }}</td><td>{{ actual(w) }}</td>
          </tr>
        </tbody>
    </table>
    </div>
  </figure>
</template>

<style scoped>
.chart {
  margin: 0;
  display: grid;
  gap: var(--space-3);
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.legend {
  display: flex;
  gap: 14px;
  font-size: 0.82rem;
  color: var(--text-2);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sw {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
.sw.planned {
  background: var(--series-planned);
}
.sw.actual {
  background: var(--accent);
}
.plot {
  position: relative;
  min-width: 0;
}
svg {
  display: block;
  touch-action: pan-y;
}
.grid line {
  stroke: var(--border);
}
.grid text,
.phases text {
  fill: var(--muted);
  font-size: 11px;
  font-family: var(--font-mono);
}
.phases text {
  font-family: var(--font-body);
  font-weight: 600;
}
.current {
  fill: var(--accent-soft);
}
.planned {
  fill: var(--series-planned);
}
.planned.recovery {
  opacity: 0.55;
}
.actual {
  fill: var(--accent);
}
.week {
  transition: opacity 0.15s var(--ease);
}
.week.dim {
  opacity: 0.45;
}
.hit {
  fill: transparent;
}
.tooltip {
  position: absolute;
  top: 0;
  width: 190px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
  font-size: 0.8rem;
  pointer-events: none;
  display: grid;
  gap: 3px;
}
.tt-title {
  font-weight: 700;
}
.tt-row {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  align-items: center;
  gap: 6px;
}
</style>
