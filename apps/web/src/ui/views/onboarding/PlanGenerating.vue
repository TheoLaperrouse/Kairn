<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { formatLongDate } from '../../../domain/format'
import type { RaceGoal } from '../../../domain/models'

defineProps<{ goal: RaceGoal }>()

const LINES = [
  'Calcul de ta périodisation…',
  'Répartition du dénivelé semaine par semaine…',
  'Placement des sorties longues et des back-to-back…',
  'Choix des séances de renforcement…',
  'Projection de ta forme le jour J…',
]

const line = ref(0)
const ticker = window.setInterval(() => {
  line.value = Math.min(line.value + 1, LINES.length - 1)
}, 650)
onBeforeUnmount(() => window.clearInterval(ticker))
</script>

<template>
  <div class="generating topo" role="status" aria-live="polite">
    <svg class="mountain" viewBox="0 0 200 120" aria-hidden="true">
      <path class="m-back" d="M0 120 L60 40 L95 80 L130 25 L200 120 Z" />
      <path class="m-path" d="M10 115 Q 50 100 60 80 T 100 70 T 128 32" />
      <circle class="m-flag" cx="130" cy="25" r="4" />
    </svg>
    <p class="gen-line">{{ LINES[line] }}</p>
    <p class="muted">{{ goal.name }} · {{ formatLongDate(goal.raceDate) }}</p>
  </div>
</template>

<style scoped>
.generating {
  min-height: 100vh;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-4);
  text-align: center;
  padding: var(--space-5);
}
.mountain {
  width: min(320px, 80vw);
}
.m-back {
  fill: var(--surface-2);
  stroke: var(--border-strong);
}
.m-path {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 220;
  stroke-dashoffset: 220;
  animation: climb 2.4s var(--ease) forwards;
}
.m-flag {
  fill: var(--teal);
  opacity: 0;
  animation: flag 0.4s 2.2s forwards;
}
@keyframes climb {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes flag {
  to {
    opacity: 1;
  }
}
.gen-line {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 600;
}
</style>
