<script setup lang="ts">
import { Mountain } from 'lucide-vue-next'
import { computed } from 'vue'
import { formatDuration } from '../../../domain/format'
import type { WorkoutStep } from '../../../domain/models'
import ZoneBadge from '../../components/ZoneBadge.vue'

const props = defineProps<{ steps: WorkoutStep[] }>()

const STEP_LABELS: Record<WorkoutStep['kind'], string> = {
  WARMUP: 'Échauffement',
  EFFORT: 'Effort',
  RECOVERY: 'Récupération',
  COOLDOWN: 'Retour au calme',
  CONTINUOUS: 'Continu',
}

/** Repeated EFFORT + RECOVERY steps are shown together. */
const stepGroups = computed(() => {
  const steps = props.steps
  const groups: Array<{ steps: WorkoutStep[]; repeat?: number }> = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const next = steps[i + 1]
    if (step.repeat && next?.repeat === step.repeat && next.kind === 'RECOVERY') {
      groups.push({ steps: [step, next], repeat: step.repeat })
      i++
    } else groups.push({ steps: [step], repeat: step.repeat })
  }
  return groups
})
</script>

<template>
  <section v-if="stepGroups.length" class="card" aria-labelledby="steps-title">
    <h2 id="steps-title" class="section-title">Déroulé</h2>
    <ol class="steps">
      <li v-for="(group, i) in stepGroups" :key="i" class="step-group" :class="{ repeated: group.repeat }">
        <span v-if="group.repeat" class="repeat-badge num">× {{ group.repeat }}</span>
        <div v-for="(step, j) in group.steps" :key="j" class="step" :style="{ '--zone': `var(--zone-${step.zone})` }">
          <span class="step-bar" aria-hidden="true" />
          <div class="step-body">
            <p class="step-head">
              <span class="step-kind">{{ STEP_LABELS[step.kind] }}</span>
              <span class="num step-dur">{{ formatDuration(step.durationMin) }}</span>
              <ZoneBadge :zone="step.zone" compact />
            </p>
            <p class="step-label">{{ step.label }}</p>
            <p v-if="step.terrain" class="muted step-terrain"><Mountain :size="13" aria-hidden="true" /> {{ step.terrain }}</p>
          </div>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.section-title {
  margin-bottom: var(--space-4);
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.step-group {
  position: relative;
  display: grid;
  gap: 2px;
}
.step-group.repeated {
  padding: var(--space-2);
  padding-top: 26px;
  border-radius: var(--radius);
  border: 1px dashed var(--border-strong);
}
.repeat-badge {
  position: absolute;
  top: 6px;
  left: 12px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent);
}
.step {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: 12px;
  background: var(--surface-2);
}
.step-bar {
  flex: none;
  width: 4px;
  border-radius: 2px;
  background: var(--zone);
}
.step-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.step-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.step-kind {
  font-weight: 700;
}
.step-dur {
  color: var(--text-2);
  font-size: 0.88rem;
}
.step-label {
  color: var(--text-2);
  font-size: 0.92rem;
}
.step-terrain {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
}
</style>
