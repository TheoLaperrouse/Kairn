<script setup lang="ts">
import { CalendarCheck, ChevronDown, CircleCheck, Send } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useApi } from '../../../application/api-provider'
import { errorMessage, formatDuration, formatNumber, formatShortDate, PHASE_LABELS, todayIso } from '../../../domain/format'
import type { PlannedSession, PlanWeek, Sport } from '../../../domain/models'
import SessionCard from '../../components/SessionCard.vue'
import { PHASE_COLORS } from '../../components/phase-colors'

const props = defineProps<{
  week: PlanWeek
  /** All sessions of the week, before filtering by sport. */
  sessions: PlannedSession[]
  sports: Set<Sport>
  currentIndex?: number
  open: boolean
  watchConfigured: boolean
}>()
defineEmits<{ toggle: [] }>()

const api = useApi()
const sending = ref(false)
const sent = ref('')

const visible = computed(() => props.sessions.filter((s) => props.sports.has(s.sport)))
const stats = computed(() => {
  const all = props.sessions.filter((s) => s.type !== 'RACE')
  return {
    done: all.filter((s) => s.status === 'DONE').length,
    total: all.length,
    strengthMin: all.filter((s) => s.sport === 'STRENGTH').reduce((a, s) => a + s.durationMin, 0),
  }
})
const hasWatchSessions = computed(() =>
  props.sessions.some((s) => s.status === 'PLANNED' && s.sport !== 'STRENGTH' && s.type !== 'RACE'),
)

async function sendWeek() {
  sending.value = true
  try {
    const list = await api.sendWeekToWatch(props.week.index)
    sent.value = list.length ? `${list.length} séance${list.length > 1 ? 's' : ''} envoyée${list.length > 1 ? 's' : ''}` : 'Aucune séance à envoyer'
  } catch (e) {
    sent.value = errorMessage(e, 'Envoi impossible')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <li
    :id="`week-${week.index}`"
    class="week card"
    :class="{ current: week.index === currentIndex, past: currentIndex !== undefined && week.index < currentIndex }"
    :style="{ '--phase': PHASE_COLORS[week.phase] }"
  >
    <button type="button" class="week-head" :aria-expanded="open" :aria-controls="`week-body-${week.index}`" @click="$emit('toggle')">
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
          <span v-if="stats.strengthMin" class="muted">+ {{ formatDuration(stats.strengthMin) }} renfo</span>
        </span>
      </span>
      <span class="week-progress" :aria-label="`${stats.done} séances faites sur ${stats.total}`">
        <span class="num">{{ stats.done }}/{{ stats.total }}</span>
      </span>
      <ChevronDown :size="20" class="chevron" aria-hidden="true" />
    </button>

    <div v-if="open" :id="`week-body-${week.index}`" class="week-body">
      <div class="week-tools">
        <p class="focus text-2">{{ week.focus }}</p>
        <RouterLink v-if="week.startDate <= todayIso()" :to="`/bilan/${week.startDate}`" class="btn btn-sm btn-ghost">
          <CalendarCheck :size="15" aria-hidden="true" /> Bilan de la semaine
        </RouterLink>
        <div v-if="watchConfigured && hasWatchSessions" class="row">
          <button type="button" class="btn btn-sm" :disabled="sending" @click="sendWeek">
            <Send :size="15" aria-hidden="true" /> {{ sending ? 'Envoi…' : 'Envoyer la semaine sur la montre' }}
          </button>
          <span v-if="sent" class="sent" role="status"><CircleCheck :size="15" aria-hidden="true" /> {{ sent }}</span>
        </div>
      </div>
      <div class="sessions">
        <SessionCard v-for="s in visible" :key="s.id" :session="s" />
        <p v-if="!visible.length" class="muted">Aucune séance pour ce filtre.</p>
      </div>
    </div>
  </li>
</template>

<style scoped>
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
