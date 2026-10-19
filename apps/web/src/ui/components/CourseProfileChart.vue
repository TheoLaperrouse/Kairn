<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatNumber } from '../../domain/format'
import type { AidStation, CoursePoint, CourseSegment, RacePlan } from '../../domain/models'
import { clockAt, dayLabel, formatHours, interpolate } from '../../domain/race-time'
import { useElementWidth } from './use-element-width'

const props = withDefaults(
  defineProps<{
    points: CoursePoint[]
    segments: CourseSegment[]
    stations: AidStation[]
    timeline: RacePlan['timeline']
    startTime: string
    height?: number
  }>(),
  { height: 320 },
)

const container = ref<HTMLDivElement>()
const width = useElementWidth(container, 900)
const compact = computed(() => width.value < 620)
const PAD = computed(() => ({ top: compact.value ? 30 : 46, right: 14, bottom: 40, left: compact.value ? 40 : 52 }))

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(target, 1)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  return (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude
}

const scale = computed(() => {
  const pad = PAD.value
  const maxD = Math.max(props.points.at(-1)?.distanceKm ?? 1, 0.1)
  const alts = props.points.map((p) => p.altitudeM)
  const rawMin = Math.min(...alts)
  const rawMax = Math.max(...alts)
  const stepY = niceStep(Math.max(rawMax - rawMin, 50), 4)
  const minA = Math.floor(rawMin / stepY) * stepY
  const maxA = Math.ceil(rawMax / stepY) * stepY || minA + stepY
  const innerW = width.value - pad.left - pad.right
  const innerH = props.height - pad.top - pad.bottom
  const x = (d: number) => pad.left + (d / maxD) * innerW
  const y = (a: number) => pad.top + innerH - ((a - minA) / (maxA - minA)) * innerH
  const yTicks: number[] = []
  for (let a = minA; a <= maxA + 0.001; a += stepY) yTicks.push(a)
  const stepX = niceStep(maxD, Math.max(Math.floor(innerW / 80), 2))
  const xTicks: number[] = []
  for (let d = 0; d <= maxD + 0.001; d += stepX) xTicks.push(Math.round(d * 10) / 10)
  return { x, y, maxD, innerW, innerH, yTicks, xTicks, base: pad.top + innerH }
})

const line = computed(() =>
  props.points.map((p, i) => `${i ? 'L' : 'M'}${scale.value.x(p.distanceKm).toFixed(1)},${scale.value.y(p.altitudeM).toFixed(1)}`).join(' '),
)
const area = computed(() => {
  if (props.points.length < 2) return ''
  return `${line.value} L${scale.value.x(props.points.at(-1)!.distanceKm).toFixed(1)},${scale.value.base} L${scale.value.x(0)},${scale.value.base} Z`
})

/** Portions de nuit déduites de l'heure de passage prévue en chaque point de la chronologie. */
const nightBands = computed(() => {
  const bands: Array<{ from: number; to: number }> = []
  let open: number | undefined
  props.timeline.forEach((t, i) => {
    const night = clockAt(props.startTime, t.elapsedH).night
    if (night && open === undefined) open = i === 0 ? 0 : (props.timeline[i - 1]!.km + t.km) / 2
    if (!night && open !== undefined) {
      bands.push({ from: open, to: (props.timeline[i - 1]!.km + t.km) / 2 })
      open = undefined
    }
  })
  if (open !== undefined) bands.push({ from: open, to: props.timeline.at(-1)?.km ?? scale.value.maxD })
  return bands
})

const SEGMENT_CLASS = { MONTEE: 'seg-up', DESCENTE: 'seg-down', ROULANT: 'seg-flat' } as const

const stationMarks = computed(() =>
  props.stations.map((station, i) => ({
    station,
    index: i + 1,
    x: scale.value.x(station.km),
    label: compact.value ? String(i + 1) : station.name.length > 16 ? `${station.name.slice(0, 15)}…` : station.name,
    row: compact.value ? 0 : i % 2,
  })),
)

interface Hover {
  km: number
  altitude: number
  elapsedH: number
}
const hover = ref<Hover>()

function onMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const px = ((event.clientX - rect.left) / rect.width) * width.value
  const km = Math.min(Math.max(((px - PAD.value.left) / scale.value.innerW) * scale.value.maxD, 0), scale.value.maxD)
  hover.value = {
    km,
    altitude: interpolate(props.points, km, (p) => p.distanceKm, (p) => p.altitudeM),
    elapsedH: interpolate(props.timeline, km, (t) => t.km, (t) => t.elapsedH),
  }
}

const hoverClock = computed(() => (hover.value ? clockAt(props.startTime, hover.value.elapsedH) : undefined))
const tooltipStyle = computed(() => {
  if (!hover.value) return {}
  const left = scale.value.x(hover.value.km)
  return { left: `${Math.min(Math.max(left, 80), width.value - 80)}px`, top: `${scale.value.y(hover.value.altitude) - 14}px` }
})
</script>

<template>
  <div ref="container" class="chart">
    <ul class="legend" aria-label="Légende">
      <li><span class="swatch seg-up" />Montée</li>
      <li><span class="swatch seg-down" />Descente</li>
      <li><span class="swatch seg-flat" />Roulant</li>
      <li v-if="nightBands.length"><span class="swatch night" />Nuit</li>
      <li><span class="tick" />Ravito</li>
      <li><span class="tick major" />Base de vie</li>
    </ul>
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      :height="height"
      role="img"
      :aria-label="`Profil du parcours : ${formatNumber(scale.maxD, 1)} km, ${stations.length} ravitaillements`"
      @pointermove="onMove"
      @pointerdown="onMove"
      @pointerleave="hover = undefined"
    >
      <defs>
        <linearGradient id="course-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.34" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.03" />
        </linearGradient>
      </defs>

      <rect
        v-for="(band, i) in nightBands"
        :key="`n${i}`"
        class="night"
        :x="scale.x(band.from)"
        :y="PAD.top"
        :width="Math.max(scale.x(band.to) - scale.x(band.from), 1)"
        :height="scale.innerH"
      />

      <g class="grid">
        <line v-for="t in scale.yTicks" :key="t" :x1="PAD.left" :x2="width - PAD.right" :y1="scale.y(t)" :y2="scale.y(t)" />
      </g>
      <g class="axis">
        <text v-for="t in scale.yTicks" :key="`y${t}`" :x="PAD.left - 8" :y="scale.y(t)" text-anchor="end" dominant-baseline="middle">
          {{ formatNumber(t) }}
        </text>
        <text v-for="t in scale.xTicks" :key="`x${t}`" :x="scale.x(t)" :y="height - 8" text-anchor="middle">{{ formatNumber(t) }} km</text>
      </g>

      <path :d="area" fill="url(#course-fill)" />
      <path :d="line" class="line" />

      <rect
        v-for="(segment, i) in segments"
        :key="`s${i}`"
        :class="SEGMENT_CLASS[segment.kind]"
        :x="scale.x(segment.startKm) + 1"
        :y="scale.base + 6"
        :width="Math.max(scale.x(segment.endKm) - scale.x(segment.startKm) - 2, 1)"
        height="6"
        rx="3"
      />

      <g v-for="mark in stationMarks" :key="`a${mark.index}`" class="station" :class="{ major: mark.station.major }">
        <line :x1="mark.x" :x2="mark.x" :y1="PAD.top - (mark.row ? 4 : 18) + 6" :y2="scale.base" />
        <circle :cx="mark.x" :cy="PAD.top - (mark.row ? 4 : 18)" r="3.5" />
        <text :x="mark.x" :y="PAD.top - (mark.row ? 4 : 18) - 7" text-anchor="middle">{{ mark.label }}</text>
      </g>

      <g v-if="hover">
        <line class="cross" :x1="scale.x(hover.km)" :x2="scale.x(hover.km)" :y1="PAD.top" :y2="scale.base" />
        <circle class="marker" :cx="scale.x(hover.km)" :cy="scale.y(hover.altitude)" r="5" />
      </g>
    </svg>
    <div v-if="hover && hoverClock" class="tooltip" :style="tooltipStyle" role="presentation">
      <strong class="num">km {{ formatNumber(hover.km, 1) }} · {{ formatNumber(Math.round(hover.altitude)) }} m</strong>
      <span class="num">{{ formatHours(hover.elapsedH) }} de course</span>
      <span class="num">{{ hoverClock.clock }} · {{ dayLabel(hoverClock.day) }}<template v-if="hoverClock.night"> · nuit</template></span>
    </div>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  width: 100%;
}
svg {
  width: 100%;
  display: block;
  touch-action: pan-y;
  overflow: visible;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  list-style: none;
  margin: 0 0 var(--space-2);
  padding: 0;
  font-size: 0.8rem;
  color: var(--text-2);
}
.legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  width: 14px;
  height: 6px;
  border-radius: 3px;
}
.tick {
  width: 2px;
  height: 12px;
  background: var(--teal);
  border-radius: 1px;
}
.tick.major {
  width: 3px;
  background: var(--accent);
}
.seg-up {
  fill: var(--accent);
  background: var(--accent);
}
.seg-down {
  fill: var(--teal);
  background: var(--teal);
}
.seg-flat {
  fill: var(--border-strong);
  background: var(--border-strong);
}
.night {
  fill: color-mix(in srgb, var(--series-form) 13%, transparent);
  background: color-mix(in srgb, var(--series-form) 45%, transparent);
}
.grid line {
  stroke: var(--border);
}
.axis text {
  fill: var(--muted);
  font-size: 11px;
  font-family: var(--font-mono);
}
.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linejoin: round;
}
.station line {
  stroke: var(--teal);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  opacity: 0.8;
}
.station circle {
  fill: var(--teal);
}
.station text {
  fill: var(--text-2);
  font-size: 11px;
  font-weight: 600;
}
.station.major line {
  stroke: var(--accent);
  stroke-dasharray: none;
  stroke-width: 1.5;
}
.station.major circle {
  fill: var(--accent);
}
.station.major text {
  fill: var(--text);
}
.cross {
  stroke: var(--text-2);
  stroke-dasharray: 3 3;
}
.marker {
  fill: var(--accent);
  stroke: var(--surface);
  stroke-width: 2;
}
.tooltip {
  position: absolute;
  transform: translate(-50%, -100%);
  pointer-events: none;
  display: grid;
  gap: 2px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
  font-size: 0.8rem;
  white-space: nowrap;
  z-index: 2;
}
.tooltip span {
  color: var(--text-2);
}
</style>
