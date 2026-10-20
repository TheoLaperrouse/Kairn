<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { DAYS_SHORT, todayIso, weekdayOf } from '../../../domain/format'
import type { PlannedSession } from '../../../domain/models'
import SessionCard from '../../components/SessionCard.vue'

const props = defineProps<{ sessions: PlannedSession[] }>()
const today = weekdayOf(todayIso())

const weekDays = computed(() => {
  const byDay: PlannedSession[][] = Array.from({ length: 7 }, () => [])
  for (const s of props.sessions) byDay[weekdayOf(s.date)]!.push(s)
  return byDay.map((sessions, i) => ({ label: DAYS_SHORT[i]!, sessions, isToday: today === i }))
})
</script>

<template>
  <section class="card" aria-labelledby="week-title">
    <div class="card-title">
      <h2 id="week-title">Cette semaine</h2>
      <RouterLink to="/plan" class="btn btn-ghost btn-sm">Tout le plan <ArrowRight :size="16" /></RouterLink>
    </div>
    <div class="week-grid">
      <div v-for="day in weekDays" :key="day.label" class="day" :class="{ today: day.isToday }">
        <p class="day-label">{{ day.label }}</p>
        <SessionCard v-for="s in day.sessions" :key="s.id" :session="s" compact />
        <p v-if="!day.sessions.length" class="day-rest">Repos</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-2);
}
.day {
  display: grid;
  gap: 6px;
  align-content: start;
  padding: var(--space-2);
  border-radius: var(--radius);
  min-width: 0;
}
.day.today {
  background: var(--accent-soft);
  outline: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
}
.day-label {
  font-weight: 700;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.day.today .day-label {
  color: var(--accent);
}
.day-rest {
  font-size: 0.8rem;
  color: var(--muted);
  padding: var(--space-2) 0;
}
@media (max-width: 900px) {
  .week-grid {
    grid-template-columns: 1fr;
  }
  .day {
    grid-template-columns: 44px 1fr;
    align-items: start;
  }
  .day > :not(.day-label) {
    grid-column: 2;
  }
  .day-label {
    grid-row: 1 / span 3;
    padding-top: 8px;
  }
}
</style>
