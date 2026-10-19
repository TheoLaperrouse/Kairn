<script setup lang="ts">
import { CalendarCheck, CircleCheck, ChevronDown, History, RotateCcw, Send, Thermometer, TriangleAlert } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useApi } from '../../application/api-provider'
import { useTrainingStore } from '../../application/stores/training'
import { PHASE_LABELS, SPORT_LABELS, formatDuration, formatNumber, formatShortDate, todayIso } from '../../domain/format'
import type { PlanWeek, Sport } from '../../domain/models'
import AdjustmentLog from '../components/AdjustmentLog.vue'
import PhaseTimeline from '../components/PhaseTimeline.vue'
import UnavailabilityDialog from '../components/UnavailabilityDialog.vue'
import SessionCard from '../components/SessionCard.vue'
import { PHASE_COLORS } from '../components/phase-colors'

const training = useTrainingStore()
const plan = computed(() => training.plan)
const today = todayIso()

const sports = ref<Set<Sport>>(new Set(['RUN', 'BIKE', 'STRENGTH']))
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

const open = ref<Set<number>>(new Set())
const selected = ref<number>()

function sessionsOf(week: PlanWeek) {
  return (plan.value?.sessions ?? []).filter((s) => s.weekIndex === week.index && sports.value.has(s.sport))
}

function weekStats(week: PlanWeek) {
  const all = (plan.value?.sessions ?? []).filter((s) => s.weekIndex === week.index && s.type !== 'COURSE')
  return { done: all.filter((s) => s.status === 'DONE').length, total: all.length, strengthMin: all.filter((s) => s.sport === 'STRENGTH').reduce((a, s) => a + s.durationMin, 0) }
}

function toggle(index: number) {
  const next = new Set(open.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  open.value = next
}

async function focusWeek(index: number) {
  selected.value = index
  open.value = new Set([...open.value, index])
  await nextTick()
  document.getElementById(`week-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const api = useApi()
const unavailabilityOpen = ref(false)
const watchConfigured = ref(false)
const sending = ref<number>()
const sentWeeks = ref<Record<number, string>>({})

async function sendWeek(index: number) {
  sending.value = index
  try {
    const sent = await api.sendWeekToWatch(index)
    sentWeeks.value = { ...sentWeeks.value, [index]: sent.length ? `${sent.length} séance${sent.length > 1 ? 's' : ''} envoyée${sent.length > 1 ? 's' : ''}` : 'Aucune séance à envoyer' }
  } catch (e) {
    sentWeeks.value = { ...sentWeeks.value, [index]: e instanceof Error ? e.message : 'Envoi impossible' }
  } finally {
    sending.value = undefined
  }
}

function hasWatchSessions(week: PlanWeek) {
  return (plan.value?.sessions ?? []).some(
    (s) => s.weekIndex === week.index && s.status === 'PLANNED' && s.sport !== 'STRENGTH' && s.type !== 'COURSE',
  )
}

onMounted(async () => {
  api
    .watchStatus()
    .then((status) => (watchConfigured.value = status.configured))
    .catch(() => undefined)
  if (currentIndex.value === undefined) return
  open.value = new Set([currentIndex.value])
  await nextTick()
  document.getElementById(`week-${currentIndex.value}`)?.scrollIntoView({ block: 'start' })
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
          v-for="sport in (['RUN', 'BIKE', 'STRENGTH'] as Sport[])"
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
        <li v-for="week in plan.weeks" :id="`week-${week.index}`" :key="week.index" class="week card" :class="{ current: week.index === currentIndex, past: currentIndex !== undefined && week.index < currentIndex }" :style="{ '--phase': PHASE_COLORS[week.phase] }">
          <button type="button" class="week-head" :aria-expanded="open.has(week.index)" :aria-controls="`week-body-${week.index}`" @click="toggle(week.index)">
            <span class="week-num">
              <span class="eyebrow">Sem.</span>
              <span class="num">{{ week.index + 1 }}</span>
            </span>
            <span class="week-info">
              <span class="week-title">
                <span class="phase-chip">{{ PHASE_LABELS[week.phase] }}</span>
                <span v-if="week.isRecovery" class="chip chip-teal">allégée</span>
                <span v-if="week.index === currentIndex" class="chip chip-accent">en cours</span>
                <span class="muted week-date">du {{ formatShortDate(week.startDate) }}</span>
              </span>
              <span class="week-targets">
                <span><strong class="num">{{ formatNumber(week.targetHours, 1) }}</strong> h</span>
                <span><strong class="num">{{ week.targetKm }}</strong> km</span>
                <span><strong class="num">{{ formatNumber(week.targetElevationM) }}</strong> m D+</span>
                <span v-if="weekStats(week).strengthMin" class="muted">+ {{ formatDuration(weekStats(week).strengthMin) }} renfo</span>
              </span>
            </span>
            <span class="week-progress" :aria-label="`${weekStats(week).done} séances faites sur ${weekStats(week).total}`">
              <span class="num">{{ weekStats(week).done }}/{{ weekStats(week).total }}</span>
            </span>
            <ChevronDown :size="20" class="chevron" aria-hidden="true" />
          </button>
          <div v-if="open.has(week.index)" :id="`week-body-${week.index}`" class="week-body">
            <div class="week-tools">
              <p class="focus text-2">{{ week.focus }}</p>
              <RouterLink v-if="week.startDate <= todayIso()" :to="`/bilan/${week.startDate}`" class="btn btn-sm btn-ghost">
                <CalendarCheck :size="15" aria-hidden="true" /> Bilan de la semaine
              </RouterLink>
              <div v-if="watchConfigured && hasWatchSessions(week)" class="row">
                <button type="button" class="btn btn-sm" :disabled="sending === week.index" @click="sendWeek(week.index)">
                  <Send :size="15" aria-hidden="true" /> {{ sending === week.index ? 'Envoi…' : 'Envoyer la semaine sur la montre' }}
                </button>
                <span v-if="sentWeeks[week.index]" class="sent" role="status"><CircleCheck :size="15" aria-hidden="true" /> {{ sentWeeks[week.index] }}</span>
              </div>
            </div>
            <div class="sessions">
              <SessionCard v-for="s in sessionsOf(week)" :key="s.id" :session="s" />
              <p v-if="!sessionsOf(week).length" class="muted">Aucune séance pour ce filtre.</p>
            </div>
          </div>
        </li>
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
.week-tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}
.sent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--success);
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
.week {
  padding: 0;
  overflow: hidden;
  border-left: 4px solid var(--phase);
  scroll-margin-top: 80px;
}
.week.current {
  border-color: var(--accent);
  border-left-color: var(--phase);
  box-shadow:
    var(--shadow),
    0 0 0 1px var(--accent);
}
.week.past {
  opacity: 0.8;
}
.week-head {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: none;
  border: 0;
  text-align: left;
  cursor: pointer;
}
.week-head:hover {
  background: var(--surface-2);
}
.week-num {
  display: grid;
  justify-items: center;
  min-width: 40px;
}
.week-num .num {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1;
}
.week-info {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.week-title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
}
.phase-chip {
  font-weight: 700;
  color: var(--text);
}
.week-date {
  font-size: 0.85rem;
}
.week-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.88rem;
  color: var(--text-2);
}
.week-targets strong {
  color: var(--text);
}
.week-progress {
  font-size: 0.85rem;
  color: var(--text-2);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-2);
}
.chevron {
  color: var(--muted);
  transition: transform 0.2s var(--ease);
}
[aria-expanded='true'] .chevron {
  transform: rotate(180deg);
}
.week-body {
  padding: 0 var(--space-5) var(--space-5);
  display: grid;
  gap: var(--space-3);
}
.focus {
  font-size: 0.92rem;
}
.sessions {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: var(--space-2);
}
@media (max-width: 600px) {
  .week-head {
    grid-template-columns: auto 1fr auto;
    padding: var(--space-3) var(--space-4);
    gap: var(--space-3);
  }
  .week-progress {
    display: none;
  }
  .week-body {
    padding: 0 var(--space-4) var(--space-4);
  }
}
</style>
