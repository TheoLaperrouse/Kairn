<script setup lang="ts">
import { History, RotateCcw, Thermometer, TriangleAlert } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useApi } from '../../application/api-provider'
import { useTrainingStore } from '../../application/stores/training'
import { SPORT_LABELS, formatShortDate, todayIso } from '../../domain/format'
import type { PlannedSession, Sport } from '../../domain/models'
import AdjustmentLog from '../components/AdjustmentLog.vue'
import PhaseTimeline from '../components/PhaseTimeline.vue'
import UnavailabilityDialog from '../components/UnavailabilityDialog.vue'
import PlanWeekItem from './plan/PlanWeekItem.vue'

const SPORTS: Sport[] = ['RUN', 'BIKE', 'STRENGTH']

const training = useTrainingStore()
const api = useApi()
const plan = computed(() => training.plan)
const today = todayIso()

const sports = ref<Set<Sport>>(new Set(SPORTS))
const open = ref<Set<number>>(new Set())
const selected = ref<number>()
const unavailabilityOpen = ref(false)
const watchConfigured = ref(false)

function toggleSport(sport: Sport) {
  const next = new Set(sports.value)
  if (next.has(sport) && next.size > 1) next.delete(sport)
  else next.add(sport)
  sports.value = next
}

const currentIndex = computed(() => {
  const weeks = plan.value?.weeks ?? []
  const found = [...weeks].reverse().find((w) => w.startDate <= today)
  return found?.index ?? weeks[0]?.index
})

const sessionsByWeek = computed(() => {
  const byWeek = new Map<number, PlannedSession[]>()
  for (const s of plan.value?.sessions ?? []) {
    const list = byWeek.get(s.weekIndex)
    if (list) list.push(s)
    else byWeek.set(s.weekIndex, [s])
  }
  return byWeek
})

function toggle(index: number) {
  const next = new Set(open.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  open.value = next
}

async function scrollToWeek(index: number, behavior?: ScrollBehavior) {
  await nextTick()
  document.getElementById(`week-${index}`)?.scrollIntoView({ behavior, block: 'start' })
}

function focusWeek(index: number) {
  selected.value = index
  open.value = new Set([...open.value, index])
  void scrollToWeek(index, 'smooth')
}

onMounted(async () => {
  api
    .watchStatus()
    .then((status) => (watchConfigured.value = status.configured))
    .catch(() => undefined)
  if (currentIndex.value === undefined) return
  open.value = new Set([currentIndex.value])
  await scrollToWeek(currentIndex.value)
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Plan d’entraînement</p>
        <h1>{{ training.goal?.name ?? 'Ton plan' }}</h1>
        <p v-if="plan" class="lead">
          {{ plan.weeks.length }} semaines depuis le {{ formatShortDate(plan.startDate) }}, organisées en phases pour arriver au top le jour J.
        </p>
      </div>
      <div class="row">
        <button type="button" class="btn" @click="unavailabilityOpen = true">
          <Thermometer :size="17" aria-hidden="true" /> Malade, blessé, indisponible ?
        </button>
        <RouterLink to="/reglages" class="btn btn-ghost"><RotateCcw :size="17" aria-hidden="true" /> Ajuster et régénérer</RouterLink>
      </div>
    </header>

    <UnavailabilityDialog :open="unavailabilityOpen" @close="unavailabilityOpen = false" />

    <template v-if="plan">
      <section class="card">
        <PhaseTimeline :weeks="plan.weeks" :current-index="currentIndex" :selected="selected" @select="focusWeek" />
      </section>

      <div v-if="plan.warnings.length" class="stack">
        <p v-for="w in plan.warnings" :key="w" class="alert"><TriangleAlert :size="18" aria-hidden="true" class="warn-icon" />{{ w }}</p>
      </div>

      <details v-if="plan.adjustments?.length" class="card adjust-card">
        <summary>
          <History :size="18" aria-hidden="true" />
          <strong>Journal des adaptations</strong>
          <span class="chip">{{ plan.adjustments.length }}</span>
        </summary>
        <AdjustmentLog :adjustments="plan.adjustments" :limit="10" />
      </details>

      <div class="filters" role="group" aria-label="Filtrer par sport">
        <span class="muted">Afficher :</span>
        <button
          v-for="sport in SPORTS"
          :key="sport"
          type="button"
          class="chip chip-toggle"
          :aria-pressed="sports.has(sport)"
          @click="toggleSport(sport)"
        >
          {{ SPORT_LABELS[sport] }}
        </button>
      </div>

      <ol class="weeks">
        <PlanWeekItem
          v-for="week in plan.weeks"
          :key="week.index"
          :week="week"
          :sessions="sessionsByWeek.get(week.index) ?? []"
          :sports="sports"
          :current-index="currentIndex"
          :open="open.has(week.index)"
          :watch-configured="watchConfigured"
          @toggle="toggle(week.index)"
        />
      </ol>
    </template>
  </div>
</template>

<style scoped>
.adjust-card summary {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  list-style: none;
}
.adjust-card summary::-webkit-details-marker {
  display: none;
}
.adjust-card[open] summary {
  margin-bottom: var(--space-4);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.warn-icon {
  flex: none;
  color: var(--accent);
  margin-top: 2px;
}
.weeks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}
</style>
