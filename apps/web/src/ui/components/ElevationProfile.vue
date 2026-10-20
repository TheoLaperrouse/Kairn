<script setup lang="ts">
import { Mountain } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { formatNumber } from '../../domain/format'
import type { ProfilePoint } from '../../domain/models'
import { pointerX, profilePaths, profileScale } from './chart'
import { useElementWidth } from './use-element-width'

const props = withDefaults(defineProps<{ points: ProfilePoint[]; height?: number }>(), { height: 220 })

const container = ref<HTMLDivElement>()
const width = useElementWidth(container)

const PAD = { top: 16, right: 12, bottom: 28, left: 48 }

const scale = computed(() =>
  profileScale(props.points, { width: width.value, height: props.height, pad: PAD }, { minAltitudeRange: 20, pxPerXTick: 90 }),
)
const paths = computed(() => profilePaths(props.points, scale.value))

const hover = ref<ProfilePoint>()
function onMove(event: PointerEvent) {
  const d = ((pointerX(event, width.value) - PAD.left) / scale.value.innerW) * scale.value.maxD
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
        <path :d="paths.area" fill="url(#elev-fill)" />
        <path :d="paths.line" class="line" />
        <g v-if="hover">
          <line class="cross" :x1="scale.x(hover.distanceKm)" :x2="scale.x(hover.distanceKm)" :y1="PAD.top" :y2="scale.base" />
          <circle class="marker" :cx="scale.x(hover.distanceKm)" :cy="scale.y(hover.altitudeM)" r="5" />
        </g>
      </svg>
      <div v-if="hover" class="chart-tooltip" :style="tooltipStyle" role="presentation">
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
.chart-tooltip {
  transform: translate(-50%, -100%);
  padding: 6px 10px;
}
.chart-tooltip span {
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
