<script setup lang="ts">
/**
 * Démonstration animée « planche anatomique » : un athlète en tenue de trail exécute le mouvement
 * en boucle et les muscles sollicités s'allument à chaque répétition.
 * Même moteur (kinematics + body-shapes) que les films Claude Motion.
 */
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { REGION_LABELS, regionsFor } from '../../domain/anatomy'
import { BODY_PALETTE, bodyShapes, type Paint } from '../../domain/body-shapes'
import { effortAt, effortOf, frameFor, poseAt, solve } from '../../domain/kinematics'
import type { Exercise } from '../../domain/models'

const props = withDefaults(
  defineProps<{
    exercise: Pick<Exercise, 'id' | 'name' | 'muscles' | 'animation'>
    /** Durée d'un cycle complet ; par défaut celle du catalogue. */
    cycleMs?: number
    paused?: boolean
    showLabels?: boolean
  }>(),
  { paused: false, showLabels: true },
)

const uid = useId()
const phase = ref(0)
let frame = 0
let last = 0

function tick(now: number) {
  if (!props.paused && last) {
    const cycle = props.cycleMs ?? props.exercise.animation.durationMs
    phase.value = (phase.value + (now - last) / cycle) % 1
  }
  last = now
  frame = requestAnimationFrame(tick)
}

onMounted(() => {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced) phase.value = 0.5
  else frame = requestAnimationFrame(tick)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
watch(
  () => props.exercise.id,
  () => (phase.value = 0),
)

const box = computed(() => frameFor(props.exercise.animation.keyframes, props.exercise.animation.props))
const regions = computed(() => regionsFor(props.exercise.muscles))
const pose = computed(() => poseAt(props.exercise.animation.keyframes, phase.value, props.exercise.animation.timing))
const shapes = computed(() => bodyShapes(solve(pose.value), regions.value))
/** Maintiens statiques (gainage) : pulsation douce ; mouvements : intensité suivant le geste. */
const effort = computed(() => {
  const fromMotion = effortOf(props.exercise.animation.keyframes, pose.value)
  return Math.max(fromMotion, 0.35 * effortAt(phase.value))
})

/** Peau et tissus reçoivent un dégradé (lumière venant du haut) ; le reste une couleur unie. */
const SHADED: Paint[] = ['skin', 'skinFar', 'top', 'shorts', 'shoe']
function fillOf(paint: Paint): string {
  return SHADED.includes(paint) ? `url(#${uid}-${paint})` : BODY_PALETTE[paint]
}
function darker(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number) => Math.max(0, Math.round(((n >> shift) & 255) * (1 - amount)))
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

/** Étiquettes : jusqu'à 3 muscles, alignées à droite du cadre avec un trait de rappel. */
const labels = computed(() => {
  if (!props.showLabels) return []
  const right = box.value.minX + box.value.width - 0.06
  return shapes.value
    .filter((s) => s.region && s.anchor)
    .slice(0, 3)
    .map((s, i) => {
      const y = box.value.minY + 0.32 + i * 0.3
      return { text: REGION_LABELS[s.region!], from: s.anchor!, to: { x: right - 1.05, y }, x: right, y }
    })
})
</script>

<template>
  <svg
    class="figure"
    :viewBox="`${box.minX} ${box.minY} ${box.width} ${box.height}`"
    role="img"
    :aria-label="`Démonstration animée : ${exercise.name}`"
  >
    <defs>
      <linearGradient v-for="paint in SHADED" :id="`${uid}-${paint}`" :key="paint" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" :stop-color="BODY_PALETTE[paint]" />
        <stop offset="1" :stop-color="darker(BODY_PALETTE[paint], 0.22)" />
      </linearGradient>
      <filter :id="`${uid}-glow`" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="0.025" />
      </filter>
    </defs>

    <line class="ground" :x1="box.minX" y1="0" :x2="box.minX + box.width" y2="0" />
    <g class="props">
      <template v-for="(prop, i) in exercise.animation.props ?? []" :key="i">
        <rect
          v-if="prop.kind === 'WALL'"
          :x="prop.x - (prop.width ?? 0.12) / 2"
          :y="box.minY"
          :width="prop.width ?? 0.12"
          :height="-box.minY"
          rx="0.02"
        />
        <rect
          v-else-if="prop.kind === 'MAT'"
          class="mat"
          :x="prop.x - (prop.width ?? 2.4) / 2"
          y="-0.035"
          :width="prop.width ?? 2.4"
          height="0.035"
          rx="0.017"
        />
        <ellipse
          v-else-if="prop.kind === 'CUSHION'"
          :cx="prop.x"
          :cy="-(prop.height ?? 0.08) / 2"
          :rx="(prop.width ?? 0.5) / 2"
          :ry="(prop.height ?? 0.08) / 2"
        />
        <rect
          v-else
          :x="prop.x - (prop.width ?? 0.8) / 2"
          :y="-(prop.height ?? 0.5)"
          :width="prop.width ?? 0.8"
          :height="prop.height ?? 0.5"
          rx="0.04"
        />
      </template>
    </g>

    <template v-for="(shape, i) in shapes" :key="i">
      <path
        v-if="shape.paint === 'muscle'"
        class="muscle"
        :d="shape.d"
        :fill="BODY_PALETTE.muscle"
        :style="{ opacity: 0.25 + 0.6 * effort }"
        :filter="`url(#${uid}-glow)`"
      />
      <path
        v-else-if="shape.paint === 'shadow'"
        :d="shape.d"
        :fill="BODY_PALETTE.shadow"
      />
      <path v-else class="part" :d="shape.d" :fill="fillOf(shape.paint)" />
    </template>

    <g v-if="labels.length" class="labels">
      <g v-for="label in labels" :key="label.text">
        <path :d="`M${label.from.x},${label.from.y} L${label.to.x},${label.to.y} L${label.x - 0.02},${label.y}`" />
        <circle :cx="label.from.x" :cy="label.from.y" r="0.022" />
        <text :x="label.x" :y="label.y - 0.05" text-anchor="end">{{ label.text }}</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.figure {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
.ground {
  stroke: var(--border-strong);
  stroke-width: 0.02;
}
.props {
  fill: var(--surface-3);
  stroke: var(--border-strong);
  stroke-width: 0.012;
}
.props .mat {
  fill: var(--teal-soft);
  stroke: none;
}
.part {
  stroke: rgb(0 0 0 / 0.22);
  stroke-width: 0.008;
  stroke-linejoin: round;
}
.muscle {
  mix-blend-mode: normal;
}
.labels path {
  stroke: var(--teal);
  stroke-width: 0.01;
  fill: none;
}
.labels circle {
  fill: var(--teal);
}
.labels text {
  font-family: var(--font-body);
  font-size: 0.12px;
  font-weight: 600;
  fill: var(--text-2);
}
</style>
