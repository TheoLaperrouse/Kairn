<script setup lang="ts">
/**
 * Tendance du score de forme sur 28 jours : ligne 2px, points colorés par niveau
 * (toujours doublés d'un libellé dans l'infobulle), zones de seuil discrètes.
 */
import { computed, ref } from 'vue'
import { formatShortDate } from '../../domain/format'
import type { ReadinessLevel, WellnessOverview } from '../../domain/models'
import { useElementWidth } from './use-element-width'

const props = defineProps<{ history: WellnessOverview['history'] }>()

const LEVEL_LABEL: Record<ReadinessLevel, string> = { VERT: 'Feu vert', ORANGE: 'Feu orange', ROUGE: 'Feu rouge' }
const LEVEL_COLOR: Record<ReadinessLevel, string> = {
  VERT: 'var(--success)',
  ORANGE: 'var(--warning)',
  ROUGE: 'var(--danger)',
}

const root = ref<HTMLElement>()
const width = useElementWidth(root, 320)
const height = 84
const pad = { left: 6, right: 6, top: 8, bottom: 18 }
const hover = ref<number>()

const points = computed(() => {
  const list = props.history
  const innerW = width.value - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  return list.map((p, i) => ({
    ...p,
    x: pad.left + (list.length > 1 ? (i / (list.length - 1)) * innerW : innerW / 2),
    y: pad.top + (1 - p.score / 100) * innerH,
  }))
})

const yOf = (score: number) => pad.top + (1 - score / 100) * (height - pad.top - pad.bottom)
const path = computed(() => points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(''))

function onMove(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const x = event.clientX - rect.left
  let best = 0
  points.value.forEach((p, i) => {
    if (Math.abs(p.x - x) < Math.abs(points.value[best]!.x - x)) best = i
  })
  hover.value = points.value.length ? best : undefined
}

const active = computed(() => (hover.value !== undefined ? points.value[hover.value] : undefined))
const tooltipLeft = computed(() => {
  if (!active.value) return 0
  return Math.min(Math.max(active.value.x - 70, 0), width.value - 140)
})
</script>

<template>
  <div ref="root" class="trend">
    <svg
      v-if="points.length > 1"
      :width="width"
      :height="height"
      role="img"
      :aria-label="`Score de forme sur ${points.length} jours`"
      @pointermove="onMove"
      @pointerleave="hover = undefined"
    >
      <line class="threshold" :x1="pad.left" :x2="width - pad.right" :y1="yOf(65)" :y2="yOf(65)" />
      <line class="threshold" :x1="pad.left" :x2="width - pad.right" :y1="yOf(45)" :y2="yOf(45)" />
      <path :d="path" class="line" />
      <line v-if="active" class="cross" :x1="active.x" :x2="active.x" :y1="pad.top" :y2="height - pad.bottom" />
      <circle
        v-for="(p, i) in points"
        :key="p.date"
        :cx="p.x"
        :cy="p.y"
        :r="hover === i ? 5 : 3.5"
        :fill="LEVEL_COLOR[p.level]"
        class="dot"
      />
      <text :x="pad.left" :y="height - 4" class="axis">{{ formatShortDate(points[0]!.date) }}</text>
      <text :x="width - pad.right" :y="height - 4" class="axis" text-anchor="end">{{ formatShortDate(points.at(-1)!.date) }}</text>
    </svg>
    <p v-else class="muted small">La tendance apparaîtra après quelques bilans.</p>
    <div v-if="active" class="tooltip" :style="{ left: `${tooltipLeft}px` }" role="status">
      <strong>{{ formatShortDate(active.date) }}</strong>
      <span><span class="num">{{ active.score }}</span>/100 · {{ LEVEL_LABEL[active.level] }}</span>
      <span v-if="active.restingHr" class="muted">FC repos {{ active.restingHr }} bpm</span>
    </div>
    <div class="visually-hidden">
      <table>
        <caption>Historique du score de forme</caption>
        <thead>
          <tr><th>Date</th><th>Score</th><th>Niveau</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in history" :key="p.date">
            <td>{{ p.date }}</td>
            <td>{{ p.score }}</td>
            <td>{{ LEVEL_LABEL[p.level] }}</td>
          </tr>
        </tbody>
    </table>
    </div>
  </div>
</template>

<style scoped>
.trend {
  position: relative;
  width: 100%;
}
svg {
  display: block;
  touch-action: pan-y;
}
.line {
  fill: none;
  stroke: var(--text-2);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.threshold {
  stroke: var(--border);
  stroke-dasharray: 3 4;
}
.cross {
  stroke: var(--border-strong);
}
.dot {
  stroke: var(--surface);
  stroke-width: 2;
  transition: r 0.12s var(--ease);
}
.axis {
  font-size: 10px;
  fill: var(--muted);
  font-family: var(--font-mono);
}
.tooltip {
  position: absolute;
  top: -8px;
  width: 140px;
  transform: translateY(-100%);
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  font-size: 0.78rem;
  pointer-events: none;
  box-shadow: var(--shadow);
  z-index: 2;
}
.small {
  font-size: 0.85rem;
}
</style>
