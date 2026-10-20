<script setup lang="ts">
import { Bike, Dumbbell, Heart } from 'lucide-vue-next'
import { DAYS, DAYS_SHORT, LEVEL_LABELS } from '../../domain/format'
import type { AthleteProfile, ExperienceLevel, TerrainAccess } from '../../domain/models'
import { inputChecked, inputNumber, inputValue, optionalNumber } from './input-event'

const profile = defineModel<AthleteProfile>({ required: true })

const LEVELS: Array<{ value: ExperienceLevel; hint: string }> = [
  { value: 'BEGINNER', hint: 'Moins de 2 ans de course, premier trail long' },
  { value: 'INTERMEDIATE', hint: 'Quelques trails terminés, jusqu’au marathon' },
  { value: 'ADVANCED', hint: 'Plusieurs trails longs, un premier ultra' },
  { value: 'EXPERT', hint: 'Ultras réguliers, gros volume' },
]

const TERRAINS: Array<{ value: TerrainAccess; label: string; hint: string }> = [
  { value: 'MOUNTAINS', label: 'Montagne', hint: 'Longues montées à portée : le plan reproduit le D+ de la course.' },
  { value: 'HILLS', label: 'Collines', hint: 'Côtes courtes : le D+ est plafonné, on répète les montées.' },
  { value: 'FLAT', label: 'Plat', hint: 'Escaliers, ponts, tapis incliné remplacent les côtes.' },
]

function update<K extends keyof AthleteProfile>(key: K, value: AthleteProfile[K]) {
  profile.value = { ...profile.value, [key]: value }
}

type Cross = AthleteProfile['crossTraining']

const CROSS = [
  {
    key: 'cycling',
    perWeek: 'cyclingSessionsPerWeek',
    icon: Bike,
    label: 'Vélo',
    hint: 'Du volume aérobie sans impacts, et de la force en côte pour les montées.',
    countLabel: 'Séances de vélo par semaine',
  },
  {
    key: 'strength',
    perWeek: 'strengthSessionsPerWeek',
    icon: Dumbbell,
    label: 'Renforcement',
    hint: 'Séances guidées avec démos animées : quadriceps excentriques, chevilles, gainage.',
    countLabel: 'Séances de renforcement par semaine',
  },
] as const

function updateCross<K extends keyof Cross>(key: K, value: Cross[K]) {
  profile.value = { ...profile.value, crossTraining: { ...profile.value.crossTraining, [key]: value } }
}

function toggleDay(day: number) {
  const days = profile.value.availableDays.includes(day)
    ? profile.value.availableDays.filter((d) => d !== day)
    : [...profile.value.availableDays, day].sort((a, b) => a - b)
  const longRunDay = days.includes(profile.value.longRunDay) ? profile.value.longRunDay : (days.at(-1) ?? profile.value.longRunDay)
  profile.value = { ...profile.value, availableDays: days, longRunDay }
}
</script>

<template>
  <div class="profile-form">
    <label class="field">
      <span>Prénom</span>
      <input class="input" :value="profile.name" maxlength="60" required autocomplete="given-name" @input="update('name', inputValue($event))" />
    </label>

    <fieldset class="group">
      <legend>Ton niveau</legend>
      <div class="cards">
        <label v-for="level in LEVELS" :key="level.value" class="option" :class="{ selected: profile.level === level.value }">
          <input type="radio" name="level" class="visually-hidden" :checked="profile.level === level.value" @change="update('level', level.value)" />
          <strong>{{ LEVEL_LABELS[level.value] }}</strong>
          <small>{{ level.hint }}</small>
        </label>
      </div>
    </fieldset>

    <div class="fields">
      <label class="field">
        <span>Kilomètres par semaine (actuellement)</span>
        <input class="input num" type="number" min="0" max="300" :value="profile.currentWeeklyKm" @input="update('currentWeeklyKm', inputNumber($event))" />
      </label>
      <label class="field">
        <span>D+ par semaine (m)</span>
        <input class="input num" type="number" min="0" max="20000" step="50" :value="profile.currentWeeklyElevationM" @input="update('currentWeeklyElevationM', inputNumber($event))" />
      </label>
    </div>

    <label class="field">
      <span>Temps d’entraînement maximum par semaine : <strong class="num accent">{{ profile.maxWeeklyHours }} h</strong></span>
      <input class="range" type="range" min="3" max="25" step="0.5" :value="profile.maxWeeklyHours" @input="update('maxWeeklyHours', inputNumber($event))" />
      <small>Le plan ne dépassera jamais ce volume, même au pic de préparation.</small>
    </label>

    <fieldset class="group">
      <legend>Jours disponibles <small>(au moins 3)</small></legend>
      <div class="days">
        <button
          v-for="(day, i) in DAYS_SHORT"
          :key="day"
          type="button"
          class="chip chip-toggle"
          :aria-pressed="profile.availableDays.includes(i)"
          :aria-label="DAYS[i]"
          @click="toggleDay(i)"
        >
          {{ day }}
        </button>
      </div>
    </fieldset>

    <label class="field">
      <span>Jour de la sortie longue</span>
      <select class="select" :value="profile.longRunDay" @change="update('longRunDay', inputNumber($event))">
        <option v-for="d in profile.availableDays" :key="d" :value="d">{{ DAYS[d] }}</option>
      </select>
    </label>

    <fieldset class="group">
      <legend>Terrain d’entraînement accessible</legend>
      <div class="cards">
        <label v-for="t in TERRAINS" :key="t.value" class="option" :class="{ selected: profile.terrain === t.value }">
          <input type="radio" name="terrain" class="visually-hidden" :checked="profile.terrain === t.value" @change="update('terrain', t.value)" />
          <strong>{{ t.label }}</strong>
          <small>{{ t.hint }}</small>
        </label>
      </div>
    </fieldset>

    <details class="optional">
      <summary><Heart :size="16" aria-hidden="true" /> Données physiologiques (facultatif)</summary>
      <p class="muted small">Elles affinent le calcul de la charge (TRIMP) et de la stratégie de ravitaillement.</p>
      <div class="fields">
        <label class="field">
          <span>FC max (bpm)</span>
          <input class="input num" type="number" min="120" max="230" :value="profile.hrMax ?? ''" @input="update('hrMax', optionalNumber($event))" />
        </label>
        <label class="field">
          <span>FC repos (bpm)</span>
          <input class="input num" type="number" min="30" max="110" :value="profile.hrRest ?? ''" @input="update('hrRest', optionalNumber($event))" />
        </label>
        <label class="field">
          <span>Poids (kg)</span>
          <input class="input num" type="number" min="30" max="200" step="0.5" :value="profile.weightKg ?? ''" @input="update('weightKg', optionalNumber($event))" />
        </label>
      </div>
    </details>

    <fieldset class="group">
      <legend>Compléments à la course <small>(à toi de choisir)</small></legend>
      <div class="cross">
        <div v-for="c in CROSS" :key="c.key" class="cross-item" :class="{ on: profile.crossTraining[c.key] }">
          <label class="switch">
            <span><component :is="c.icon" :size="18" aria-hidden="true" /> {{ c.label }}</span>
            <input type="checkbox" :checked="profile.crossTraining[c.key]" @change="updateCross(c.key, inputChecked($event))" />
          </label>
          <p class="small muted">{{ c.hint }}</p>
          <div v-if="profile.crossTraining[c.key]" class="count" role="group" :aria-label="c.countLabel">
            <button v-for="n in [1, 2] as const" :key="n" type="button" class="chip chip-toggle" :aria-pressed="profile.crossTraining[c.perWeek] === n" @click="updateCross(c.perWeek, n)">
              {{ n }} / semaine
            </button>
          </div>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.profile-form {
  display: grid;
  gap: var(--space-5);
}
.group {
  border: 0;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-2);
}
.group legend {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 6px;
  padding: 0;
}
.group legend small {
  color: var(--muted);
  font-weight: 500;
}
.cards {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
}
.option {
  display: grid;
  gap: 4px;
  align-content: start;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color 0.15s var(--ease);
}
.option:hover {
  border-color: var(--border-strong);
}
.option:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.option.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.option small {
  color: var(--text-2);
  font-size: 0.8rem;
}
.fields {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
}
.accent {
  color: var(--accent);
}
.range {
  width: 100%;
  accent-color: var(--accent);
}
.days {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.small {
  font-size: 0.82rem;
}
.optional {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-2);
}
.optional summary {
  cursor: pointer;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.optional[open] summary {
  margin-bottom: var(--space-3);
}
.optional .fields {
  margin-top: var(--space-3);
}
.cross {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
}
.cross-item {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding: var(--space-3);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.cross-item.on {
  border-color: var(--teal);
  background: var(--teal-soft);
}
.cross-item .switch {
  background: var(--surface);
}
.cross-item .switch span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.count {
  display: flex;
  gap: var(--space-2);
}
</style>
