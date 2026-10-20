<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, formatNumber } from '../../../domain/format'
import type { ClimbRehearsal, CourseSegment, RaceCourse, RacePlan } from '../../../domain/models'
import { clockAt, formatHours } from '../../../domain/race-time'

const props = defineProps<{ course: RaceCourse; plan: RacePlan }>()

const KIND_LABEL: Record<CourseSegment['kind'], string> = { UPHILL: 'Montée', DOWNHILL: 'Descente', FLAT: 'Portion roulante' }

const keySegments = computed(() => props.plan.segments.filter((s) => s.key))
const hasHills = computed(() => keySegments.value.some((s) => s.kind !== 'FLAT'))
const hasRehearsal = computed(() => keySegments.value.some((s) => s.rehearsal))

/** Beyond this many repetitions, the local hill alone is not enough. */
const MANY_REPETITIONS = 15
/** A local hill this much gentler than the race does not train the same effort. */
const GENTLER_GAP_PCT = -3

function rehearsalAdvice(s: CourseSegment, r: ClimbRehearsal): string | undefined {
  if (r.gradeGapPct <= GENTLER_GAP_PCT) {
    return s.kind === 'UPHILL'
      ? 'Plus douce que la course : monte en marche rapide avec les bâtons, ou complète sur tapis incliné.'
      : 'Plus douce que la course : travaille aussi la technique sur une descente plus raide, même courte.'
  }
  if (r.repetitions > MANY_REPETITIONS) return 'Côte courte : répartis les répétitions sur plusieurs séances, ou complète avec des escaliers.'
  return undefined
}

function segmentText(s: CourseSegment): string {
  const length = formatNumber(s.endKm - s.startKm, 1)
  if (s.kind === 'FLAT') return `${KIND_LABEL[s.kind]} de ${length} km`
  const drop = s.kind === 'UPHILL' ? s.gainM : s.lossM
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
          <div v-if="segment.rehearsal" class="rehearsal">
            <p>
              <span class="muted">Chez toi :</span>
              <strong class="num">{{ segment.rehearsal.repetitions }} ×</strong>
              {{ segment.kind === 'UPHILL' ? 'la montée' : 'la descente' }} de
              <RouterLink :to="`/activites/${segment.rehearsal.local.activityId}`">{{ segment.rehearsal.local.activityName }}</RouterLink>
              <span class="muted">
                ({{ formatNumber(segment.rehearsal.local.elevationM) }} m à {{ formatNumber(segment.rehearsal.local.gradePct, 0) }} %, km
                {{ formatNumber(segment.rehearsal.local.startKm, 1) }}, {{ formatDate(segment.rehearsal.local.date) }})
              </span>
            </p>
            <p class="muted small">
              À ton rythme sur cette côte ({{ formatNumber(segment.rehearsal.local.verticalSpeed) }} m/h), compte
              {{ formatHours(segment.rehearsal.estimatedDurationH) }} sans la fatigue de course.
            </p>
            <p v-if="rehearsalAdvice(segment, segment.rehearsal)" class="muted small">{{ rehearsalAdvice(segment, segment.rehearsal) }}</p>
          </div>
        </div>
        <span class="num duration">{{ formatHours(segment.durationH) }}</span>
      </li>
    </ol>
    <p v-if="hasHills && !hasRehearsal" class="muted small">
      Importe des sorties avec du dénivelé : Kairn y cherchera les côtes qui ressemblent le plus à celles de la course.
    </p>
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
.kind-UPHILL .bar {
  background: var(--accent);
}
.kind-DOWNHILL .bar {
  background: var(--teal);
}
.rehearsal {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.rehearsal p {
  margin: 0;
}
.rehearsal p + p {
  margin-top: 2px;
}
.duration {
  font-weight: 700;
  white-space: nowrap;
}
</style>
