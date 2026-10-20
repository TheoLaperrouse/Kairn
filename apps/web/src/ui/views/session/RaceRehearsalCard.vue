<script setup lang="ts">
import { MapPin } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { useRaceCourseStore } from '../../../application/stores/race-course'
import { formatNumber } from '../../../domain/format'
import type { PlannedSession, SessionType } from '../../../domain/models'

const props = defineProps<{ session: PlannedSession }>()
const store = useRaceCourseStore()

onMounted(() => {
  if (!store.view) store.load().catch(() => undefined)
})

/** Sessions worth doing on the hill that rehearses a race climb (or descent). */
const TERRAIN: Partial<Record<SessionType, 'UPHILL' | 'DOWNHILL'>> = {
  UPHILL_THRESHOLD: 'UPHILL',
  HILL_REPEATS: 'UPHILL',
  HIKE_RUN: 'UPHILL',
  LONG_RUN: 'UPHILL',
  DOWNHILL: 'DOWNHILL',
}

/** The biggest race difficulty of the matching kind that has a local equivalent. */
const target = computed(() => {
  const kind = TERRAIN[props.session.type]
  if (!kind || !store.view) return undefined
  const drop = (s: { gainM: number; lossM: number }) => (kind === 'UPHILL' ? s.gainM : s.lossM)
  return store.view.plan.segments
    .filter((s) => s.kind === kind && s.rehearsal)
    .sort((a, b) => drop(b) - drop(a))
    .map((s) => ({ segment: s, rehearsal: s.rehearsal!, drop: drop(s) }))[0]
})
</script>

<template>
  <section v-if="target" class="card rehearsal" aria-labelledby="rehearsal-title">
    <h2 id="rehearsal-title" class="section-title"><MapPin :size="18" aria-hidden="true" /> Où la faire</h2>
    <p>
      Sur
      <RouterLink :to="`/activites/${target.rehearsal.local.activityId}`">{{ target.rehearsal.local.activityName }}</RouterLink>
      <span class="muted">
        ({{ target.segment.kind === 'UPHILL' ? 'montée' : 'descente' }} de {{ formatNumber(target.rehearsal.local.elevationM) }} m à
        {{ formatNumber(target.rehearsal.local.gradePct, 0) }} %, km {{ formatNumber(target.rehearsal.local.startKm, 1) }})
      </span>
      : c’est ta côte la plus proche de la
      {{ target.segment.kind === 'UPHILL' ? 'montée' : 'descente' }} du km {{ formatNumber(target.segment.startKm, 1) }} de la course
      <span>({{ target.segment.kind === 'UPHILL' ? '+' : '−' }}{{ formatNumber(target.drop) }} m à {{ formatNumber(Math.abs(target.segment.avgGradePct), 0) }} %)</span>.
    </p>
    <p class="muted small">
      Il faudrait l’enchaîner <strong class="num">{{ target.rehearsal.repetitions }} fois</strong> pour couvrir tout son dénivelé.
      <RouterLink to="/course">Voir le plan de course</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.rehearsal p {
  margin: 0;
}
.rehearsal p + p {
  margin-top: var(--space-2);
}
.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.small {
  font-size: 0.82rem;
}
</style>
