<script setup lang="ts">
/** Frise de la préparation : une case par semaine, colorée par phase. */
import { computed } from 'vue'
import { PHASE_LABELS, formatShortDate } from '../../domain/format'
import type { PlanWeek, TrainingPhase } from '../../domain/models'
import { PHASE_COLORS } from './phase-colors'

const props = defineProps<{ weeks: PlanWeek[]; currentIndex?: number; selected?: number }>()
const emit = defineEmits<{ select: [index: number] }>()

const phases = computed(() => {
  const seen: TrainingPhase[] = []
  for (const w of props.weeks) if (!seen.includes(w.phase)) seen.push(w.phase)
  return seen
})
</script>

<template>
  <div class="timeline">
    <ol class="weeks" aria-label="Semaines de la préparation">
      <li v-for="w in weeks" :key="w.index">
        <button
          type="button"
          class="week"
          :class="{ current: w.index === currentIndex, selected: w.index === selected, recovery: w.isRecovery, past: currentIndex !== undefined && w.index < currentIndex }"
          :style="{ '--phase': PHASE_COLORS[w.phase] }"
          :aria-label="`Semaine ${w.index + 1}, ${PHASE_LABELS[w.phase]}${w.isRecovery ? ', récupération' : ''}, du ${formatShortDate(w.startDate)}`"
          :aria-current="w.index === currentIndex ? 'date' : undefined"
          @click="emit('select', w.index)"
        >
          <span class="bar" :style="{ height: `${Math.max(18, Math.min(100, w.targetHours * 7))}%` }" />
        </button>
      </li>
    </ol>
    <div class="legend">
      <span v-for="p in phases" :key="p" class="legend-item">
        <span class="sw" :style="{ background: PHASE_COLORS[p] }" aria-hidden="true" />{{ PHASE_LABELS[p] }}
      </span>
      <span class="legend-item muted"><span class="sw recovery-sw" aria-hidden="true" />Semaine allégée</span>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  display: grid;
  gap: var(--space-3);
}
.weeks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 3px;
  height: 64px;
  align-items: end;
}
.weeks li {
  height: 100%;
}
.week {
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  display: flex;
  align-items: flex-end;
  cursor: pointer;
  border-radius: 5px;
}
.bar {
  width: 100%;
  border-radius: 4px 4px 2px 2px;
  background: var(--phase);
  opacity: 0.9;
  transition:
    opacity 0.15s var(--ease),
    transform 0.15s var(--ease);
}
.week.recovery .bar {
  opacity: 0.4;
}
.week.past .bar {
  opacity: 0.45;
}
.week:hover .bar {
  opacity: 1;
  transform: scaleY(1.05);
  transform-origin: bottom;
}
.week.current {
  box-shadow: 0 -2px 0 0 var(--text) inset;
}
.week.current .bar {
  opacity: 1;
  outline: 2px solid var(--text);
  outline-offset: 1px;
}
.week.selected .bar {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.8rem;
  color: var(--text-2);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sw {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.recovery-sw {
  background: var(--border-strong);
}
</style>
