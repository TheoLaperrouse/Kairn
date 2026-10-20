<script setup lang="ts">
/**
 * Trace d'une sortie : profil altimétrique et fréquence cardiaque en deux panneaux superposés
 * qui partagent l'axe des distances (jamais deux échelles sur un même graphique).
 * Les montées détectées sont numérotées sur le profil, les zones cardiaques en bandes sous la FC.
 */
import { computed, ref } from 'vue'
import { ZONE_LABELS, formatNumber, formatSeconds } from '../../domain/format'
import type { ActivitySample, Climb, Zone } from '../../domain/models'
import { niceStep, pointerX, ticksBetween } from './chart'
import { useElementWidth } from './use-element-width'

const props = defineProps<{
  samples: ActivitySample[]
  climbs?: Climb[]
  /** Bornes basses de Z2 à Z5 (bpm). */
  zoneBounds?: [number, number, number, number]
}>()

const container = ref<HTMLDivElement>()
const width = useElementWidth(container, 640, 260)

const PAD = { top: 22, right: 34, left: 46, bottom: 26 }
const ALT_H = 170
const HR_H = 150
const GAP = 18

function ticks(min: number, max: number, target: number) {
  const step = niceStep(Math.max(max - min, 1), target)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  return { lo, hi: hi === lo ? lo + step : hi, list: ticksBetween(lo, hi, step) }
}

/** Sur tapis ou sans GPS la distance manque : l'axe passe alors au temps. */
const byDistance = computed(() => (props.samples.at(-1)?.d ?? 0) > 0.3)
const xOf = (s: ActivitySample) => (byDistance.value ? s.d : s.t / 60)

const hasAltitude = computed(() => props.samples.filter((s) => s.alt !== undefined).length >= 2)
const hasHeartRate = computed(() => props.samples.filter((s) => s.hr !== undefined).length >= 2)

const layout = computed(() => {
  let y = PAD.top
  const alt = hasAltitude.value ? { top: y, height: ALT_H } : undefined
  if (alt) y += ALT_H + GAP
  const hr = hasHeartRate.value ? { top: y, height: HR_H } : undefined
  if (hr) y += HR_H
  return { alt, hr, height: y + PAD.bottom, innerW: width.value - PAD.left - PAD.right }
})

const xScale = computed(() => {
  const max = Math.max(xOf(props.samples.at(-1) ?? { t: 60, d: 0.1 }), 0.1)
  const step = niceStep(max, Math.max(Math.floor(layout.value.innerW / 80), 2))
  return { max, list: ticksBetween(0, max, step, 1), x: (v: number) => PAD.left + (v / max) * layout.value.innerW }
})

const altScale = computed(() => {
  const panel = layout.value.alt
  if (!panel) return undefined
  const alts = props.samples.flatMap((s) => (s.alt === undefined ? [] : [s.alt]))
  const t = ticks(Math.min(...alts), Math.max(...alts, Math.min(...alts) + 30), 4)
  return { ...t, y: (a: number) => panel.top + panel.height - ((a - t.lo) / (t.hi - t.lo)) * panel.height }
})

const hrScale = computed(() => {
  const panel = layout.value.hr
  if (!panel) return undefined
  // Bas de l'échelle au 2e centile : les premières secondes (FC encore au repos) écraseraient la courbe.
  const hrs = props.samples.flatMap((s) => (s.hr === undefined ? [] : [s.hr])).sort((a, b) => a - b)
  const low = hrs[Math.floor(hrs.length * 0.02)]!
  const t = ticks(Math.min(low - 8, (props.zoneBounds?.[0] ?? low) - 10), hrs.at(-1)! + 6, 4)
  return { ...t, y: (h: number) => panel.top + panel.height - ((Math.min(Math.max(h, t.lo), t.hi) - t.lo) / (t.hi - t.lo)) * panel.height }
})

/** Tracé d'une série, interrompu là où la valeur manque. */
function path(value: (s: ActivitySample) => number | undefined, y: (v: number) => number): string {
  let d = ''
  let pen = false
  for (const s of props.samples) {
    const v = value(s)
    if (v === undefined) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${xScale.value.x(xOf(s)).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
  }
  return d
}

const altLine = computed(() => (altScale.value ? path((s) => s.alt, altScale.value.y) : ''))
const altArea = computed(() => {
  if (!altScale.value || !layout.value.alt) return ''
  const withAlt = props.samples.filter((s) => s.alt !== undefined)
  const base = layout.value.alt.top + layout.value.alt.height
  return `${altLine.value} L${xScale.value.x(xOf(withAlt.at(-1)!)).toFixed(1)},${base} L${xScale.value.x(xOf(withAlt[0]!)).toFixed(1)},${base} Z`
})
const hrLine = computed(() => (hrScale.value ? path((s) => s.hr, hrScale.value.y) : ''))

const climbBands = computed(() => {
  if (!byDistance.value || !layout.value.alt) return []
  return (props.climbs ?? []).map((c, i) => ({
    n: i + 1,
    x1: xScale.value.x(c.startKm),
    x2: xScale.value.x(c.endKm),
    climb: c,
  }))
})

const zoneBands = computed(() => {
  const scale = hrScale.value
  const bounds = props.zoneBounds
  if (!scale || !bounds) return []
  const edges = [scale.lo, ...bounds, scale.hi]
  return ([1, 2, 3, 4, 5] as Zone[]).flatMap((zone) => {
    const lo = Math.max(edges[zone - 1]!, scale.lo)
    const hi = Math.min(zone === 5 ? scale.hi : edges[zone]!, scale.hi)
    if (hi <= lo) return []
    const y1 = scale.y(hi)
    const y2 = scale.y(lo)
    return [{ zone, y: y1, height: y2 - y1 }]
  })
})

function zoneOf(hr: number): Zone {
  const bounds = props.zoneBounds
  if (!bounds) return 1
  return (bounds.filter((b) => hr >= b).length + 1) as Zone
}

const hover = ref<ActivitySample>()
function onMove(event: PointerEvent) {
  const target = ((pointerX(event, width.value) - PAD.left) / layout.value.innerW) * xScale.value.max
  let best = props.samples[0]
  for (const s of props.samples) if (Math.abs(xOf(s) - target) < Math.abs(xOf(best!) - target)) best = s
  hover.value = best
}

const tooltipStyle = computed(() => {
  if (!hover.value) return {}
  const x = xScale.value.x(xOf(hover.value))
  const flip = x > width.value - 170
  return { left: `${x}px`, top: `${PAD.top}px`, transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }
})

const summary = computed(() => {
  const parts = [`Trace sur ${formatNumber(xScale.value.max, 1)} ${byDistance.value ? 'km' : 'min'}`]
  if (props.climbs?.length) parts.push(`${props.climbs.length} montée(s) détectée(s)`)
  if (hasHeartRate.value) {
    const hrs = props.samples.flatMap((s) => (s.hr === undefined ? [] : [s.hr]))
    parts.push(`FC de ${Math.min(...hrs)} à ${Math.max(...hrs)} bpm`)
  }
  return parts.join(', ')
})
</script>

<template>
  <div ref="container" class="trace">
    <svg
      :viewBox="`0 0 ${width} ${layout.height}`"
      :height="layout.height"
      role="img"
      :aria-label="summary"
      @pointermove="onMove"
      @pointerleave="hover = undefined"
    >
      <defs>
        <linearGradient id="trace-alt-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <g v-if="layout.alt && altScale">
        <text class="panel-title" :x="PAD.left" :y="layout.alt.top - 8">Altitude (m)</text>
        <g class="grid">
          <line v-for="t in altScale.list" :key="`ga${t}`" :x1="PAD.left" :x2="width - PAD.right" :y1="altScale.y(t)" :y2="altScale.y(t)" />
        </g>
        <g v-for="band in climbBands" :key="`c${band.n}`" class="climb">
          <rect :x="band.x1" :y="layout.alt.top" :width="Math.max(band.x2 - band.x1, 1)" :height="layout.alt.height" />
          <circle v-if="band.x2 - band.x1 > 14" :cx="(band.x1 + band.x2) / 2" :cy="layout.alt.top + 10" r="8" class="climb-badge" />
          <text v-if="band.x2 - band.x1 > 14" :x="(band.x1 + band.x2) / 2" :y="layout.alt.top + 10" class="climb-n" text-anchor="middle" dominant-baseline="central">{{ band.n }}</text>
        </g>
        <path :d="altArea" fill="url(#trace-alt-fill)" />
        <path :d="altLine" class="alt-line" />
        <g class="axis">
          <text v-for="t in altScale.list" :key="`ya${t}`" :x="PAD.left - 8" :y="altScale.y(t)" text-anchor="end" dominant-baseline="middle">{{ formatNumber(t) }}</text>
        </g>
      </g>

      <g v-if="layout.hr && hrScale">
        <text class="panel-title" :x="PAD.left" :y="layout.hr.top - 6">Fréquence cardiaque (bpm)</text>
        <g v-for="band in zoneBands" :key="`z${band.zone}`">
          <rect :x="PAD.left" :y="band.y" :width="layout.innerW" :height="band.height" class="zone-band" :style="{ fill: `var(--zone-${band.zone})` }" />
          <text v-if="band.height >= 12" :x="width - PAD.right + 6" :y="band.y + band.height / 2" class="zone-label" dominant-baseline="middle">Z{{ band.zone }}</text>
        </g>
        <path :d="hrLine" class="hr-line" />
        <g class="axis">
          <text v-for="t in hrScale.list" :key="`yh${t}`" :x="PAD.left - 8" :y="hrScale.y(t)" text-anchor="end" dominant-baseline="middle">{{ t }}</text>
        </g>
      </g>

      <g class="axis">
        <line class="baseline" :x1="PAD.left" :x2="width - PAD.right" :y1="layout.height - PAD.bottom" :y2="layout.height - PAD.bottom" />
        <text v-for="t in xScale.list" :key="`x${t}`" :x="xScale.x(t)" :y="layout.height - 8" text-anchor="middle">
          {{ formatNumber(t, 1) }} {{ byDistance ? 'km' : 'min' }}
        </text>
      </g>

      <g v-if="hover">
        <line class="cross" :x1="xScale.x(xOf(hover))" :x2="xScale.x(xOf(hover))" :y1="PAD.top" :y2="layout.height - PAD.bottom" />
        <circle v-if="altScale && hover.alt !== undefined" class="marker alt" :cx="xScale.x(xOf(hover))" :cy="altScale.y(hover.alt)" r="4.5" />
        <circle v-if="hrScale && hover.hr !== undefined" class="marker hr" :cx="xScale.x(xOf(hover))" :cy="hrScale.y(hover.hr)" r="4.5" />
      </g>
    </svg>

    <div v-if="hover" class="chart-tooltip" :style="tooltipStyle" role="presentation">
      <span class="muted num">{{ formatSeconds(hover.t) }} · km {{ formatNumber(hover.d, 2) }}</span>
      <span v-if="hover.alt !== undefined"><i class="key alt" aria-hidden="true" /><strong class="num">{{ formatNumber(hover.alt) }} m</strong></span>
      <span v-if="hover.hr !== undefined">
        <i class="key hr" aria-hidden="true" /><strong class="num">{{ hover.hr }} bpm</strong>
        <template v-if="zoneBounds"> · {{ ZONE_LABELS[zoneOf(hover.hr)] }}</template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.trace {
  position: relative;
  width: 100%;
}
svg {
  width: 100%;
  display: block;
  touch-action: pan-y;
}
.panel-title {
  fill: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}
.grid line,
.baseline {
  stroke: var(--border);
  stroke-width: 1;
}
.axis text,
.zone-label {
  fill: var(--muted);
  font-size: 11px;
  font-family: var(--font-mono);
}
.alt-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.hr-line {
  fill: none;
  stroke: var(--series-form);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.zone-band {
  opacity: 0.12;
}
.climb rect {
  fill: var(--teal);
  opacity: 0.08;
}
.climb-badge {
  fill: var(--surface);
  stroke: var(--teal);
  stroke-width: 1.5;
}
.climb-n {
  fill: var(--text);
  font-size: 10px;
  font-weight: 700;
}
.cross {
  stroke: var(--text-2);
  stroke-width: 1;
}
.marker {
  stroke: var(--surface);
  stroke-width: 2;
}
.marker.alt {
  fill: var(--accent);
}
.marker.hr {
  fill: var(--series-form);
}
.chart-tooltip {
  gap: 3px;
}
.key {
  display: inline-block;
  width: 10px;
  height: 3px;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: middle;
}
.key.alt {
  background: var(--accent);
}
.key.hr {
  background: var(--series-form);
}
</style>
