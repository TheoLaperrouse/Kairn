<script setup lang="ts">
/**
 * Forme de fond (CTL), fatigue (ATL) et fraîcheur (TSB) sur un axe unique.
 * La partie future est projetée à partir des séances prévues (pointillés).
 */
import { computed, ref } from 'vue'
import { formatLongDate, formatShortDate, formatNumber } from '../../domain/format'
import type { LoadPoint } from '../../domain/models'
import { linePath, pointerX, ticksBetween } from './chart'
import { useElementWidth } from './use-element-width'

const props = defineProps<{ points: LoadPoint[]; raceDate?: string }>()

type Key = 'fitness' | 'fatigue' | 'form'
const SERIES: Array<{ key: Key; label: string; color: string; hint: string }> = [
  { key: 'fitness', label: 'Forme de fond', color: 'var(--series-fitness)', hint: 'CTL · 42 j' },
  { key: 'fatigue', label: 'Fatigue', color: 'var(--series-fatigue)', hint: 'ATL · 7 j' },
  { key: 'form', label: 'Fraîcheur', color: 'var(--series-form)', hint: 'TSB = CTL − ATL' },
]

const host = ref<HTMLElement>()
const width = useElementWidth(host)
const height = computed(() => (width.value < 520 ? 230 : 280))
const margin = computed(() => ({ top: 16, right: width.value < 520 ? 70 : 96, bottom: 28, left: 34 }))
const innerW = computed(() => width.value - margin.value.left - margin.value.right)
const innerH = computed(() => height.value - margin.value.top - margin.value.bottom)

const domain = computed(() => {
  const values = props.points.flatMap((p) => [p.fitness, p.fatigue, p.form])
  const min = Math.min(0, ...values)
  const max = Math.max(10, ...values)
  const pad = (max - min) * 0.08
  return { min: Math.floor((min - pad) / 10) * 10, max: Math.ceil((max + pad) / 10) * 10 }
})

const x = (i: number) => margin.value.left + (props.points.length > 1 ? (i / (props.points.length - 1)) * innerW.value : 0)
const y = (v: number) => margin.value.top + innerH.value * (1 - (v - domain.value.min) / (domain.value.max - domain.value.min))

const todayIndex = computed(() => {
  const i = props.points.findIndex((p) => p.projected)
  return i === -1 ? props.points.length - 1 : Math.max(i - 1, 0)
})
const raceIndex = computed(() => (props.raceDate ? props.points.findIndex((p) => p.date === props.raceDate) : -1))

function path(key: Key, from: number, to: number): string {
  return linePath(props.points.slice(from, to + 1).map((p, k) => [x(from + k), y(p[key])]))
}

const yTicks = computed(() => {
  const { min, max } = domain.value
  const step = Math.max(10, Math.ceil((max - min) / 5 / 10) * 10)
  return ticksBetween(Math.ceil(min / step) * step, max, step)
})

const xTicks = computed(() => {
  const n = props.points.length
  const count = width.value < 520 ? 3 : 6
  if (n < 2) return []
  return Array.from({ length: count }, (_, k) => Math.round((k / (count - 1)) * (n - 1)))
})

/** Étiquettes directes en bout de ligne, écartées pour ne pas se chevaucher. */
const endLabels = computed(() => {
  const last = props.points.length - 1
  if (last < 0) return []
  const items = SERIES.map((s) => ({ ...s, value: props.points[last]![s.key], y: y(props.points[last]![s.key]) })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < items.length; i++) items[i]!.y = Math.max(items[i]!.y, items[i - 1]!.y + 15)
  return items
})

const hover = ref<number>()
function onPointer(event: PointerEvent) {
  const ratio = (pointerX(event, width.value) - margin.value.left) / innerW.value
  hover.value = Math.min(Math.max(Math.round(ratio * (props.points.length - 1)), 0), props.points.length - 1)
}
const hovered = computed(() => (hover.value === undefined ? undefined : props.points[hover.value]))
const tooltipLeft = computed(() => {
  if (hover.value === undefined) return 0
  const px = x(hover.value)
  return Math.min(Math.max(px - 90, 0), width.value - 180)
})
</script>

<template>
  <figure class="chart">
    <figcaption class="legend">
      <span v-for="s in SERIES" :key="s.key" class="legend-item">
        <span class="swatch" :style="{ background: s.color }" aria-hidden="true" />
        {{ s.label }} <span class="muted">{{ s.hint }}</span>
      </span>
      <span class="legend-item muted"><span class="swatch dashed" aria-hidden="true" /> projection selon le plan</span>
    </figcaption>

    <div ref="host" class="plot">
      <svg
        v-if="points.length > 1"
        :width="width"
        :height="height"
        :viewBox="`0 0 ${width} ${height}`"
        aria-hidden="true"
        @pointermove="onPointer"
        @pointerdown="onPointer"
        @pointerleave="hover = undefined"
      >
        <g class="grid">
          <g v-for="t in yTicks" :key="t">
            <line :x1="margin.left" :x2="width - margin.right" :y1="y(t)" :y2="y(t)" :class="{ zero: t === 0 }" />
            <text :x="margin.left - 8" :y="y(t)" text-anchor="end" dominant-baseline="middle">{{ t }}</text>
          </g>
          <text v-for="i in xTicks" :key="`x${i}`" :x="x(i)" :y="height - 8" :text-anchor="i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'">
            {{ formatShortDate(points[i]!.date) }}
          </text>
        </g>

        <rect class="future" :x="x(todayIndex)" :y="margin.top" :width="Math.max(x(points.length - 1) - x(todayIndex), 0)" :height="innerH" />

        <g v-for="s in SERIES" :key="s.key" :style="{ stroke: s.color }" class="series">
          <path :d="path(s.key, 0, todayIndex)" />
          <path :d="path(s.key, todayIndex, points.length - 1)" class="projected" />
        </g>

        <g class="marker today">
          <line :x1="x(todayIndex)" :x2="x(todayIndex)" :y1="margin.top" :y2="margin.top + innerH" />
          <text :x="x(todayIndex) + 6" :y="margin.top + 10">Aujourd’hui</text>
        </g>
        <g v-if="raceIndex >= 0" class="marker race">
          <line :x1="x(raceIndex)" :x2="x(raceIndex)" :y1="margin.top" :y2="margin.top + innerH" />
          <circle :cx="x(raceIndex)" :cy="y(points[raceIndex]!.form)" r="5" />
          <text :x="x(raceIndex) - 6" :y="margin.top + 10" text-anchor="end">Jour J</text>
        </g>

        <g class="end-labels">
          <text v-for="l in endLabels" :key="l.key" :x="width - margin.right + 8" :y="l.y" dominant-baseline="middle">
            <tspan class="end-value">{{ formatNumber(l.value) }}</tspan>
            <tspan class="end-name" dx="4">{{ l.label.split(' ')[0] }}</tspan>
          </text>
        </g>

        <g v-if="hovered && hover !== undefined" class="crosshair">
          <line :x1="x(hover)" :x2="x(hover)" :y1="margin.top" :y2="margin.top + innerH" />
          <circle v-for="s in SERIES" :key="s.key" :cx="x(hover)" :cy="y(hovered[s.key])" r="4.5" :style="{ fill: s.color }" />
        </g>
        <rect class="hit" :x="margin.left" :y="0" :width="innerW" :height="height" />
      </svg>

      <div v-if="hovered" class="tooltip" :style="{ left: `${tooltipLeft}px` }" role="status">
        <p class="tt-date">{{ formatLongDate(hovered.date) }}<span v-if="hovered.projected" class="muted"> · projeté</span></p>
        <p v-for="s in SERIES" :key="s.key" class="tt-row">
          <span class="swatch" :style="{ background: s.color }" aria-hidden="true" />
          <span>{{ s.label }}</span>
          <strong class="num">{{ formatNumber(hovered[s.key], 1) }}</strong>
        </p>
        <p class="tt-row muted"><span /> <span>Charge du jour</span><strong class="num">{{ hovered.load }}</strong></p>
      </div>
    </div>

    <div class="visually-hidden">
      <table>
        <caption>Forme, fatigue et fraîcheur par jour</caption>
        <thead>
          <tr><th>Date</th><th>Forme</th><th>Fatigue</th><th>Fraîcheur</th><th>Projection</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in points" :key="p.date">
            <td>{{ p.date }}</td><td>{{ p.fitness }}</td><td>{{ p.fatigue }}</td><td>{{ p.form }}</td><td>{{ p.projected ? 'oui' : 'non' }}</td>
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
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  font-size: 0.82rem;
  color: var(--text-2);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  width: 14px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
}
.swatch.dashed {
  background: repeating-linear-gradient(90deg, var(--muted) 0 4px, transparent 4px 7px);
}
.plot {
  position: relative;
  width: 100%;
  min-width: 0;
}
svg {
  display: block;
  touch-action: pan-y;
}
.grid line {
  stroke: var(--border);
  stroke-width: 1;
}
.grid line.zero {
  stroke: var(--border-strong);
}
.grid text,
.marker text {
  fill: var(--muted);
  font-size: 11px;
  font-family: var(--font-mono);
}
.future {
  fill: var(--surface-2);
  opacity: 0.6;
}
.series path {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.series .projected {
  stroke-dasharray: 5 4;
  opacity: 0.85;
}
.marker line {
  stroke: var(--muted);
  stroke-dasharray: 2 3;
}
.marker.race line {
  stroke: var(--accent);
}
.marker.race circle {
  fill: var(--accent);
  stroke: var(--surface);
  stroke-width: 2;
}
.marker.race text {
  fill: var(--accent);
  font-weight: 700;
}
.end-labels text {
  font-size: 11.5px;
  fill: var(--text-2);
}
.end-value {
  font-family: var(--font-mono);
  font-weight: 700;
  fill: var(--text);
}
.crosshair line {
  stroke: var(--text-2);
  stroke-width: 1;
}
.crosshair circle {
  stroke: var(--surface);
  stroke-width: 2;
}
.hit {
  fill: transparent;
  cursor: crosshair;
}
.tooltip {
  position: absolute;
  top: 8px;
  width: 180px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
  font-size: 0.8rem;
  pointer-events: none;
  display: grid;
  gap: 4px;
}
.tt-date {
  font-weight: 700;
  text-transform: capitalize;
}
.tt-row {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  align-items: center;
  gap: 6px;
}
</style>
