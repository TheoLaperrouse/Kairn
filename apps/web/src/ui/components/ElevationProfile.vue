<script setup lang="ts">
import { Mountain } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatNumber } from '../../domain/format'
import type { ProfilePoint } from '../../domain/models'

const props = withDefaults(defineProps<{ points: ProfilePoint[]; height?: number }>(), { height: 220 })

const container = ref<HTMLDivElement>()
const width = ref(640)
let observer: ResizeObserver | undefined

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.max(entry.contentRect.width, 240)
  })
  if (container.value) observer.observe(container.value)
})
onBeforeUnmount(() => observer?.disconnect())

const PAD = { top: 16, right: 12, bottom: 28, left: 48 }

function niceStep(range: number, target: number): number {
  const raw = range / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  return (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude
}

const scale = computed(() => {
  const pts = props.points
  const maxD = Math.max(pts.at(-1)?.distanceKm ?? 1, 0.1)
  const alts = pts.map((p) => p.altitudeM)
  const rawMin = Math.min(...alts)
  const rawMax = Math.max(...alts)
  const stepY = niceStep(Math.max(rawMax - rawMin, 20), 4)
  const minA = Math.floor(rawMin / stepY) * stepY
  const maxA = Math.ceil(rawMax / stepY) * stepY || minA + stepY
  const innerW = width.value - PAD.left - PAD.right
  const innerH = props.height - PAD.top - PAD.bottom
  const x = (d: number) => PAD.left + (d / maxD) * innerW
  const y = (a: number) => PAD.top + innerH - ((a - minA) / (maxA - minA)) * innerH
  const yTicks: number[] = []
  for (let a = minA; a <= maxA + 0.001; a += stepY) yTicks.push(a)
  const stepX = niceStep(maxD, Math.max(Math.floor(innerW / 90), 2))
  const xTicks: number[] = []
  for (let d = 0; d <= maxD + 0.001; d += stepX) xTicks.push(Math.round(d * 10) / 10)
  return { x, y, maxD, minA, innerW, innerH, yTicks, xTicks }
})

const line = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${scale.value.x(p.distanceKm).toFixed(1)},${scale.value.y(p.altitudeM).toFixed(1)}`).join(' '))
const area = computed(() => {
  if (props.points.length === 0) return ''
  const base = PAD.top + scale.value.innerH
  return `${line.value} L${scale.value.x(props.points.at(-1)!.distanceKm).toFixed(1)},${base} L${PAD.left},${base} Z`
})

const hover = ref<ProfilePoint>()
function onMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const px = ((event.clientX - rect.left) / rect.width) * width.value
  const d = ((px - PAD.left) / scale.value.innerW) * scale.value.maxD
  let best = props.points[0]
  for (const p of props.points) if (Math.abs(p.distanceKm - d) < Math.abs((best?.distanceKm ?? 0) - d)) best = p
  hover.value = best
}

const tooltipStyle = computed(() => {
  if (!hover.value) return {}
  const left = scale.value.x(hover.value.distanceKm)
  return { left: `${Math.min(Math.max(left, 70), width.value - 70)}px`, top: `${scale.value.y(hover.value.altitudeM) - 12}px` }
})
</script>

<template>
  <div ref="container" class="profile">
    <div v-if="points.length < 2" class="empty">
      <Mountain :size="28" aria-hidden="true" />
      <p>Pas de profil altimétrique pour cette activité.</p>
      <small class="muted">La trace des sorties Strava est récupérée automatiquement aux synchronisations suivantes.</small>
    </div>
    <template v-else>
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        :height="height"
        role="img"
        :aria-label="`Profil altimétrique sur ${formatNumber(scale.maxD, 1)} km, de ${Math.min(...points.map((p) => p.altitudeM))} à ${Math.max(...points.map((p) => p.altitudeM))} m`"
        @pointermove="onMove"
        @pointerleave="hover = undefined"
      >
        <defs>
          <linearGradient id="elev-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <g class="grid">
          <line v-for="t in scale.yTicks" :key="t" :x1="PAD.left" :x2="width - PAD.right" :y1="scale.y(t)" :y2="scale.y(t)" />
        </g>
        <g class="axis">
          <text v-for="t in scale.yTicks" :key="`y${t}`" :x="PAD.left - 8" :y="scale.y(t)" text-anchor="end" dominant-baseline="middle">{{ formatNumber(t) }}</text>
          <text v-for="t in scale.xTicks" :key="`x${t}`" :x="scale.x(t)" :y="height - 8" text-anchor="middle">{{ formatNumber(t, 1) }} km</text>
        </g>
        <path :d="area" fill="url(#elev-fill)" />
        <path :d="line" class="line" />
        <g v-if="hover">
          <line class="cross" :x1="scale.x(hover.distanceKm)" :x2="scale.x(hover.distanceKm)" :y1="PAD.top" :y2="PAD.top + scale.innerH" />
          <circle class="marker" :cx="scale.x(hover.distanceKm)" :cy="scale.y(hover.altitudeM)" r="5" />
        </g>
      </svg>
      <div v-if="hover" class="tooltip" :style="tooltipStyle" role="presentation">
        <strong class="num">{{ formatNumber(hover.altitudeM) }} m</strong>
        <span class="num">km {{ formatNumber(hover.distanceKm, 2) }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile {
  position: relative;
  width: 100%;
}
svg {
  width: 100%;
  display: block;
  touch-action: pan-y;
}
.grid line {
  stroke: var(--border);
  stroke-width: 1;
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
.cross {
  stroke: var(--text-2);
  stroke-width: 1;
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
}
.tooltip span {
  color: var(--text-2);
}
.empty {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--text-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
}
</style>
