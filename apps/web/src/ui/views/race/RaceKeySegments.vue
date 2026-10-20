<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber } from '../../../domain/format'
import type { CourseSegment, RaceCourse, RacePlan } from '../../../domain/models'
import { clockAt, formatHours } from '../../../domain/race-time'

const props = defineProps<{ course: RaceCourse; plan: RacePlan }>()

const KIND_LABEL: Record<CourseSegment['kind'], string> = { MONTEE: 'Montée', DESCENTE: 'Descente', ROULANT: 'Portion roulante' }

/** Seules les vraies difficultés : au moins 250 m (ou 8 % du dénivelé total) de montée ou de descente. */
const keySegments = computed(() => {
  const threshold = Math.max(250, props.course.elevationGainM * 0.08)
  return props.plan.segments.filter(
    (s) => (s.kind === 'MONTEE' && s.gainM >= threshold) || (s.kind === 'DESCENTE' && s.lossM >= threshold) || (s.kind === 'ROULANT' && s.endKm - s.startKm >= 5),
  )
})

function segmentText(s: CourseSegment): string {
  const length = formatNumber(s.endKm - s.startKm, 1)
  if (s.kind === 'ROULANT') return `${KIND_LABEL[s.kind]} de ${length} km`
  const drop = s.kind === 'MONTEE' ? s.gainM : s.lossM
  return `${KIND_LABEL[s.kind]} de ${formatNumber(drop)} m à ${formatNumber(Math.abs(s.avgGradePct), 0)} % sur ${length} km`
}
</script>

<template>
  <section v-if="keySegments.length" class="card no-print">
    <h2 class="card-title">Les grandes difficultés</h2>
    <ol class="segments">
      <li v-for="(segment, i) in keySegments" :key="`seg${i}`" :class="`kind-${segment.kind}`">
        <span class="bar" aria-hidden="true" />
        <div>
          <strong>{{ segmentText(segment) }}</strong>
          <p class="muted small num">
            km {{ formatNumber(segment.startKm, 1) }} → {{ formatNumber(segment.endKm, 1) }} · départ après
            {{ formatHours(segment.startElapsedH) }} ({{ clockAt(course.settings.startTime, segment.startElapsedH).clock }})
          </p>
        </div>
        <span class="num duration">{{ formatHours(segment.durationH) }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.small {
  font-size: 0.82rem;
}
.segments {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.segments li {
  display: grid;
  grid-template-columns: 6px 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) 0;
}
.segments .bar {
  align-self: stretch;
  border-radius: 3px;
  background: var(--border-strong);
}
.kind-MONTEE .bar {
  background: var(--accent);
}
.kind-DESCENTE .bar {
  background: var(--teal);
}
.duration {
  font-weight: 700;
  white-space: nowrap;
}
</style>
