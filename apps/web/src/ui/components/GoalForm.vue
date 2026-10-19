<script setup lang="ts">
import { Check, MapPin, Moon, Mountain } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { useTrainingStore } from '../../application/stores/training'
import { formatNumber, todayIso } from '../../domain/format'
import type { RaceGoal, RacePreset, TrailCategory } from '../../domain/models'

const goal = defineModel<RaceGoal>({ required: true })
const training = useTrainingStore()

onMounted(() => void training.loadPresets())

const TECHNICITY = [
  { value: 1, label: 'Roulant', hint: 'Chemins larges, peu de cailloux' },
  { value: 2, label: 'Facile', hint: 'Sentiers propres' },
  { value: 3, label: 'Montagne', hint: 'Sentiers de montagne classiques' },
  { value: 4, label: 'Technique', hint: 'Pierriers, racines, raidards' },
  { value: 5, label: 'Très technique', hint: 'Mains nécessaires, marches' },
] as const

const CATEGORY_NAMES: Record<TrailCategory, string> = {
  XS: 'Trail court',
  S: 'Trail',
  M: 'Trail long',
  L: 'Ultra-trail',
  XL: 'Ultra-trail long',
  XXL: 'Ultra-trail XXL',
}

const effort = computed(() => (goal.value.distanceKm || 0) + (goal.value.elevationGainM || 0) / 100)
const category = computed<TrailCategory>(() => {
  const e = effort.value
  if (e < 25) return 'XS'
  if (e < 45) return 'S'
  if (e < 75) return 'M'
  if (e < 115) return 'L'
  if (e < 155) return 'XL'
  return 'XXL'
})
const ratio = computed(() => (goal.value.distanceKm > 0 ? Math.round(goal.value.elevationGainM / goal.value.distanceKm) : 0))

/** Prochaine occurrence du mois habituel de l'épreuve, au moins 8 semaines plus tard. */
function nextDateFor(month: number): string {
  const today = new Date(`${todayIso()}T00:00:00Z`)
  const minDate = new Date(today.getTime() + 56 * 86_400_000)
  let year = today.getUTCFullYear()
  let candidate = new Date(Date.UTC(year, month - 1, 15))
  while (candidate < minDate) {
    year++
    candidate = new Date(Date.UTC(year, month - 1, 15))
  }
  // Samedi le plus proche du 15 : la plupart des épreuves ont lieu le week-end.
  const shift = (6 - candidate.getUTCDay() + 7) % 7
  return new Date(candidate.getTime() + shift * 86_400_000).toISOString().slice(0, 10)
}

function choosePreset(preset: RacePreset) {
  goal.value = {
    ...goal.value,
    name: preset.name,
    distanceKm: preset.distanceKm,
    elevationGainM: preset.elevationGainM,
    technicity: preset.technicity,
    maxAltitudeM: preset.maxAltitudeM,
    polesAllowed: preset.polesAllowed,
    nightSections: preset.nightSections,
    presetId: preset.presetId,
    raceDate: goal.value.presetId === preset.presetId && goal.value.raceDate ? goal.value.raceDate : nextDateFor(preset.usualMonth),
  }
}

function chooseCustom() {
  goal.value = { ...goal.value, presetId: undefined }
}

function update<K extends keyof RaceGoal>(key: K, value: RaceGoal[K]) {
  goal.value = { ...goal.value, [key]: value }
}

function numberOrUndefined(event: Event): number | undefined {
  const raw = (event.target as HTMLInputElement).value
  return raw === '' ? undefined : Number(raw)
}
</script>

<template>
  <div class="goal-form">
    <section aria-labelledby="presets-title" class="stack">
      <div class="row between">
        <h3 id="presets-title">Choisis une course mythique…</h3>
        <span class="muted small">Données indicatives des dernières éditions</span>
      </div>
      <div class="presets" role="list">
        <button
          v-for="preset in training.presets"
          :key="preset.presetId"
          type="button"
          role="listitem"
          class="preset"
          :class="{ selected: goal.presetId === preset.presetId }"
          :aria-pressed="goal.presetId === preset.presetId"
          @click="choosePreset(preset)"
        >
          <span class="preset-head">
            <strong>{{ preset.name }}</strong>
            <Check v-if="goal.presetId === preset.presetId" :size="18" class="tick" aria-hidden="true" />
          </span>
          <span class="preset-place"><MapPin :size="13" aria-hidden="true" /> {{ preset.location }}</span>
          <span class="preset-stats num">
            {{ preset.distanceKm }} km · {{ formatNumber(preset.elevationGainM) }} m D+
          </span>
          <span class="preset-hl">{{ preset.highlights }}</span>
        </button>
        <button
          type="button"
          role="listitem"
          class="preset custom"
          :class="{ selected: !goal.presetId }"
          :aria-pressed="!goal.presetId"
          @click="chooseCustom"
        >
          <span class="preset-head"><strong>Ma course</strong></span>
          <span class="preset-hl">Un trail local, une course moins connue : saisis ses caractéristiques.</span>
        </button>
      </div>
    </section>

    <section aria-labelledby="details-title" class="stack">
      <h3 id="details-title">…et ajuste les détails</h3>
      <div class="fields">
        <label class="field span-2">
          <span>Nom de la course</span>
          <input class="input" :value="goal.name" required maxlength="80" @input="update('name', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field">
          <span>Date</span>
          <input class="input" type="date" :min="todayIso()" :value="goal.raceDate" required @input="update('raceDate', ($event.target as HTMLInputElement).value)" />
        </label>
        <label class="field">
          <span>Distance (km)</span>
          <input class="input num" type="number" min="1" max="500" step="0.1" :value="goal.distanceKm" required @input="update('distanceKm', Number(($event.target as HTMLInputElement).value))" />
        </label>
        <label class="field">
          <span>Dénivelé positif (m)</span>
          <input class="input num" type="number" min="0" max="40000" step="10" :value="goal.elevationGainM" required @input="update('elevationGainM', Number(($event.target as HTMLInputElement).value))" />
        </label>
        <label class="field">
          <span>Altitude max (m) <small>facultatif</small></span>
          <input class="input num" type="number" min="0" max="9000" :value="goal.maxAltitudeM ?? ''" @input="update('maxAltitudeM', numberOrUndefined($event))" />
        </label>
        <label class="field">
          <span>Objectif chrono (h) <small>facultatif</small></span>
          <input class="input num" type="number" min="0.5" max="200" step="0.5" :value="goal.targetTimeH ?? ''" placeholder="Estimé automatiquement" @input="update('targetTimeH', numberOrUndefined($event))" />
        </label>
      </div>

      <fieldset class="technicity">
        <legend>Technicité du terrain</legend>
        <div class="tech-options">
          <label v-for="t in TECHNICITY" :key="t.value" class="tech" :class="{ selected: goal.technicity === t.value }">
            <input type="radio" name="technicity" class="visually-hidden" :checked="goal.technicity === t.value" @change="update('technicity', t.value)" />
            <span class="tech-bars" aria-hidden="true">
              <i v-for="n in 5" :key="n" :class="{ on: n <= t.value }" />
            </span>
            <strong>{{ t.label }}</strong>
            <small>{{ t.hint }}</small>
          </label>
        </div>
      </fieldset>

      <div class="toggles">
        <label class="switch">
          <span><Mountain :size="16" aria-hidden="true" /> Bâtons autorisés</span>
          <input type="checkbox" :checked="goal.polesAllowed" @change="update('polesAllowed', ($event.target as HTMLInputElement).checked)" />
        </label>
        <label class="switch">
          <span><Moon :size="16" aria-hidden="true" /> Sections de nuit</span>
          <input type="checkbox" :checked="goal.nightSections" @change="update('nightSections', ($event.target as HTMLInputElement).checked)" />
        </label>
      </div>
    </section>

    <aside class="preview topo" aria-live="polite">
      <div>
        <p class="eyebrow">Km-effort</p>
        <p class="big num">{{ formatNumber(effort) }}</p>
      </div>
      <div>
        <p class="eyebrow">Catégorie</p>
        <p class="big"><span class="cat num">{{ category }}</span> {{ CATEGORY_NAMES[category] }}</p>
      </div>
      <div>
        <p class="eyebrow">Verticalité</p>
        <p class="big num">{{ ratio }} <small>m D+/km</small></p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.goal-form {
  display: grid;
  gap: var(--space-6);
}
.between {
  justify-content: space-between;
}
.small {
  font-size: 0.8rem;
}
.presets {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
}
.preset {
  display: grid;
  gap: 6px;
  align-content: start;
  text-align: left;
  padding: var(--space-4);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  transition:
    border-color 0.15s var(--ease),
    transform 0.15s var(--ease),
    background 0.15s var(--ease);
}
.preset:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
.preset.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.preset.custom {
  border-style: dashed;
}
.preset-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-display);
  font-size: 1.05rem;
}
.tick {
  color: var(--accent);
}
.preset-place {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--muted);
}
.preset-stats {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--teal);
}
.preset-hl {
  font-size: 0.82rem;
  color: var(--text-2);
}
.fields {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
}
.span-2 {
  grid-column: 1 / -1;
}
.technicity {
  border: 0;
  padding: 0;
  margin: 0;
}
.technicity legend {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 6px;
}
.tech-options {
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
}
.tech {
  display: grid;
  gap: 4px;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
}
.tech:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.tech.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.tech small {
  color: var(--muted);
  font-size: 0.75rem;
}
.tech-bars {
  display: flex;
  gap: 3px;
}
.tech-bars i {
  width: 14px;
  height: 5px;
  border-radius: 3px;
  background: var(--surface-3);
}
.tech-bars i.on {
  background: var(--accent);
}
.toggles {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
}
.switch span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 550;
}
.preview {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.big {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 650;
  margin-top: 4px;
}
.big small {
  font-size: 0.8rem;
  color: var(--muted);
  font-family: var(--font-body);
}
.cat {
  display: inline-block;
  padding: 0 8px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 1.1rem;
  margin-right: 4px;
}
</style>
