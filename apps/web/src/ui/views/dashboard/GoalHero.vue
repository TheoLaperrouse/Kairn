<script setup lang="ts">
import { Clock, Flag, Mountain, Route } from 'lucide-vue-next'
import { computed } from 'vue'
import { useAuthStore } from '../../../application/stores/auth'
import { useTrainingStore } from '../../../application/stores/training'
import { PHASE_LABELS, formatLongDate, formatNumber } from '../../../domain/format'
import type { Dashboard } from '../../../domain/models'
import { PHASE_COLORS } from '../../components/phase-colors'

const props = defineProps<{ goal: Dashboard['goal']; currentWeek: Dashboard['currentWeek'] }>()

const training = useTrainingStore()
const auth = useAuthStore()

const greeting = computed(() => {
  const hour = new Date().getHours()
  const name = training.profile?.name ?? auth.user?.displayName ?? ''
  return `${hour < 6 || hour >= 18 ? 'Bonsoir' : 'Bonjour'} ${name}`.trim()
})

const countdown = computed(() => ({ weeks: Math.floor(props.goal.daysToRace / 7), days: props.goal.daysToRace % 7 }))
</script>

<template>
  <section class="hero topo" aria-labelledby="hero-title">
    <div class="hero-main">
      <p class="eyebrow">{{ greeting }} · objectif</p>
      <h1 id="hero-title">{{ goal.name }}</h1>
      <p class="hero-date">{{ formatLongDate(goal.raceDate) }}</p>
      <div class="hero-facts">
        <span class="fact"><Route :size="16" aria-hidden="true" /><span class="num">{{ formatNumber(goal.distanceKm) }}</span> km</span>
        <span class="fact"><Mountain :size="16" aria-hidden="true" /><span class="num">{{ formatNumber(goal.elevationGainM) }}</span> m D+</span>
        <span class="fact"><Clock :size="16" aria-hidden="true" />≈ <span class="num">{{ formatNumber(goal.estimatedDurationH, 1) }}</span> h</span>
        <span class="chip chip-accent">{{ goal.category }} · {{ goal.categoryLabel }}</span>
        <span class="chip">{{ goal.kmEffort }} km-effort</span>
      </div>
    </div>
    <div class="countdown" :aria-label="`Course dans ${goal.daysToRace} jours`">
      <template v-if="goal.daysToRace > 0">
        <span class="cd-label">J −</span>
        <span class="cd-value num">{{ goal.daysToRace }}</span>
        <span class="cd-sub">{{ countdown.weeks }} sem. {{ countdown.days }} j</span>
      </template>
      <template v-else-if="goal.daysToRace === 0">
        <Flag :size="40" />
        <span class="cd-sub">C’est le jour J !</span>
      </template>
      <template v-else>
        <span class="cd-sub">Course terminée — bravo !</span>
      </template>
    </div>
    <div v-if="currentWeek" class="hero-phase">
      <span class="phase-dot" :style="{ background: PHASE_COLORS[currentWeek.phase] }" aria-hidden="true" />
      <div>
        <p class="phase-name">
          Phase {{ PHASE_LABELS[currentWeek.phase] }}
          <span v-if="currentWeek.isRecovery" class="chip chip-teal">semaine allégée</span>
        </p>
        <p class="text-2">{{ currentWeek.focus }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-5);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background:
    radial-gradient(600px 300px at 100% 0%, var(--accent-soft), transparent 70%),
    linear-gradient(160deg, var(--surface), var(--surface-2));
  box-shadow: var(--shadow);
}
.hero h1 {
  font-size: clamp(2rem, 5vw, 3.2rem);
  margin-top: var(--space-2);
}
.hero-date {
  color: var(--text-2);
  margin-top: 4px;
}
.hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: var(--space-4);
  align-items: center;
}
.fact {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
}
.fact .num {
  color: var(--text);
  font-weight: 600;
}
.countdown {
  display: grid;
  justify-items: end;
  align-content: center;
  text-align: right;
  color: var(--accent);
}
.cd-label {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.1rem;
}
.cd-value {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 9vw, 6rem);
  font-weight: 700;
  line-height: 0.9;
  letter-spacing: -0.05em;
}
.cd-sub {
  color: var(--text-2);
  font-size: 0.9rem;
  margin-top: 6px;
}
.hero-phase {
  grid-column: 1 / -1;
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
.phase-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 6px;
  flex: none;
}
.phase-name {
  font-weight: 700;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
@media (max-width: 600px) {
  .hero {
    grid-template-columns: 1fr;
    padding: var(--space-5);
  }
  .countdown {
    justify-items: start;
    text-align: left;
    grid-row: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .cd-value {
    font-size: 3rem;
  }
}
</style>
