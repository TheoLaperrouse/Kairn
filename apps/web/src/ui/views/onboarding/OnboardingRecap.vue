<script setup lang="ts">
import { Bike, Dumbbell, Flag, Mountain } from 'lucide-vue-next'
import { DAYS, LEVEL_LABELS, TERRAIN_LABELS, formatLongDate, formatNumber } from '../../../domain/format'
import type { AthleteProfile, RaceGoal } from '../../../domain/models'

defineProps<{ goal: RaceGoal; profile: AthleteProfile; weeksToRace: number }>()
defineEmits<{ edit: [] }>()
</script>

<template>
  <div class="recap">
    <article class="card recap-card">
      <Flag :size="22" class="ic" aria-hidden="true" />
      <h2>{{ goal.name }}</h2>
      <p class="num big">{{ goal.distanceKm }} km · {{ formatNumber(goal.elevationGainM) }} m D+</p>
      <p class="text-2">{{ formatLongDate(goal.raceDate) }} — dans {{ weeksToRace }} semaines</p>
    </article>
    <article class="card recap-card">
      <Mountain :size="22" class="ic" aria-hidden="true" />
      <h2>{{ profile.name }}</h2>
      <p class="text-2">{{ LEVEL_LABELS[profile.level] }} · terrain {{ TERRAIN_LABELS[profile.terrain].toLowerCase() }}</p>
      <p class="text-2">
        {{ profile.availableDays.length }} jours / semaine, jusqu’à {{ profile.maxWeeklyHours }} h · sortie longue le
        {{ DAYS[profile.longRunDay]?.toLowerCase() }}
      </p>
    </article>
    <article class="card recap-card">
      <Dumbbell :size="22" class="ic" aria-hidden="true" />
      <h2>Compléments</h2>
      <p class="text-2">
        <Dumbbell :size="14" aria-hidden="true" />
        {{ profile.crossTraining.strength ? `Renforcement ${profile.crossTraining.strengthSessionsPerWeek}×/sem.` : 'Pas de renforcement' }}
      </p>
      <p class="text-2">
        <Bike :size="14" aria-hidden="true" />
        {{ profile.crossTraining.cycling ? `Vélo ${profile.crossTraining.cyclingSessionsPerWeek}×/sem.` : 'Pas de vélo' }}
      </p>
      <button type="button" class="btn btn-sm btn-ghost" @click="$emit('edit')">Modifier</button>
    </article>
  </div>
</template>

<style scoped>
.recap {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
}
.recap-card {
  display: grid;
  gap: var(--space-2);
  align-content: start;
}
.recap-card .ic {
  color: var(--accent);
}
.recap-card p {
  display: flex;
  align-items: center;
  gap: 6px;
}
.recap-card .btn {
  justify-self: start;
}
.big {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--teal);
}
</style>
