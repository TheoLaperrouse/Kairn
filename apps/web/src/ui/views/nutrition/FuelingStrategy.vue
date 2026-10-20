<script setup lang="ts">
import { Coffee, Droplets, Printer, Snowflake, Sparkles, Wheat } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useContentStore } from '../../../application/stores/content'
import { useTrainingStore } from '../../../application/stores/training'
import { errorMessage, formatNumber } from '../../../domain/format'
import type { FuelingInput, FuelingPlan } from '../../../domain/models'

const content = useContentStore()
const training = useTrainingStore()

const fueling = ref<FuelingInput>({ durationH: 12, temperatureC: 18, weightKg: 70, sweat: 'MEDIUM', gut: 'PARTIAL' })
const plan = ref<FuelingPlan>()
const computing = ref(false)
const fuelingError = ref('')

// Prefilled with the goal's estimated duration and the profile weight.
onMounted(async () => {
  if (!training.dashboard) await training.loadDashboard().catch(() => {})
  const estimated = training.dashboard?.goal.estimatedDurationH
  if (estimated) fueling.value.durationH = Math.round(estimated * 2) / 2
  if (training.profile?.weightKg) fueling.value.weightKg = training.profile.weightKg
})

async function compute() {
  computing.value = true
  fuelingError.value = ''
  try {
    plan.value = await content.fuelingPlan(fueling.value)
  } catch (e) {
    fuelingError.value = errorMessage(e, 'Calcul impossible')
  } finally {
    computing.value = false
  }
}

const SWEAT = [
  { value: 'LOW', label: 'Faible' },
  { value: 'MEDIUM', label: 'Moyenne' },
  { value: 'HIGH', label: 'Forte (traces de sel)' },
] as const
const GUT = [
  { value: 'NONE', label: 'Pas entraîné', hint: '≈ 60 g/h' },
  { value: 'PARTIAL', label: 'En cours', hint: '≈ 75 g/h' },
  { value: 'TRAINED', label: 'Entraîné', hint: '≈ 90 g/h' },
] as const

const maxCarbs = computed(() => Math.max(...(plan.value?.hours.map((h) => h.carbsG) ?? [1])))

function print() {
  window.print()
}
</script>

<template>
  <section class="stack-lg" aria-label="Stratégie de course">
    <form class="card calc no-print" @submit.prevent="compute">
      <div class="card-title">
        <h2>Calculateur de ravitaillement</h2>
        <span v-if="training.dashboard" class="chip chip-teal">{{ training.dashboard.goal.name }} · ~{{ formatNumber(training.dashboard.goal.estimatedDurationH, 1) }} h estimées</span>
      </div>
      <div class="calc-grid">
        <label class="field">
          <span>Durée prévue : <strong class="num">{{ fueling.durationH }} h</strong></span>
          <input v-model.number="fueling.durationH" type="range" min="1" max="60" step="0.5" class="range" />
        </label>
        <label class="field">
          <span>Température moyenne : <strong class="num">{{ fueling.temperatureC }} °C</strong></span>
          <input v-model.number="fueling.temperatureC" type="range" min="-10" max="40" step="1" class="range" />
        </label>
        <label class="field">
          <span>Poids (kg)</span>
          <input v-model.number="fueling.weightKg" class="input num" type="number" min="35" max="150" step="0.5" />
        </label>
      </div>
      <div class="calc-grid">
        <fieldset class="seg">
          <legend>Transpiration</legend>
          <label v-for="s in SWEAT" :key="s.value" :class="{ on: fueling.sweat === s.value }">
            <input v-model="fueling.sweat" type="radio" name="sweat" :value="s.value" class="visually-hidden" />
            {{ s.label }}
          </label>
        </fieldset>
        <fieldset class="seg">
          <legend>Entraînement intestinal</legend>
          <label v-for="g in GUT" :key="g.value" :class="{ on: fueling.gut === g.value }">
            <input v-model="fueling.gut" type="radio" name="gut" :value="g.value" class="visually-hidden" />
            {{ g.label }} <small>{{ g.hint }}</small>
          </label>
        </fieldset>
      </div>
      <p v-if="fuelingError" class="alert alert-error" role="alert">{{ fuelingError }}</p>
      <div class="row">
        <button type="submit" class="btn btn-primary" :disabled="computing"><Sparkles :size="18" aria-hidden="true" /> Calculer ma stratégie</button>
        <button v-if="plan" type="button" class="btn" @click="print"><Printer :size="18" aria-hidden="true" /> Imprimer</button>
      </div>
    </form>

    <template v-if="plan">
      <div class="print-only print-head">
        <h1>Plan de ravitaillement{{ training.dashboard ? ` — ${training.dashboard.goal.name}` : '' }}</h1>
        <p>{{ fueling.durationH }} h · {{ fueling.temperatureC }} °C · {{ fueling.weightKg }} kg</p>
      </div>

      <div class="grid grid-4 kpis">
        <div class="card kpi carbs">
          <Wheat :size="20" aria-hidden="true" />
          <span class="eyebrow">Glucides</span>
          <strong class="num">{{ plan.carbsPerHourG }} <small>g/h</small></strong>
          <span class="muted small num">{{ formatNumber(plan.totals.carbsG) }} g au total</span>
        </div>
        <div class="card kpi">
          <Droplets :size="20" aria-hidden="true" />
          <span class="eyebrow">Boisson</span>
          <strong class="num">{{ plan.fluidPerHourMl }} <small>ml/h</small></strong>
          <span class="muted small num">{{ formatNumber(plan.totals.fluidL, 1) }} L au total</span>
        </div>
        <div class="card kpi">
          <Snowflake :size="20" aria-hidden="true" />
          <span class="eyebrow">Sodium</span>
          <strong class="num">{{ plan.sodiumPerHourMg }} <small>mg/h</small></strong>
          <span class="muted small num">{{ formatNumber(plan.totals.sodiumMg) }} mg au total</span>
        </div>
        <div class="card kpi">
          <Coffee :size="20" aria-hidden="true" />
          <span class="eyebrow">Caféine</span>
          <strong class="num">{{ plan.caffeineMg || '—' }} <small v-if="plan.caffeineMg">mg</small></strong>
          <span class="muted small">{{ plan.caffeineMg ? 'en 2e partie ou avant la nuit' : 'inutile sur ce format' }}</span>
        </div>
      </div>

      <section class="card" aria-labelledby="hours-title">
        <div class="card-title"><h2 id="hours-title">Heure par heure</h2></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Heure</th>
                <th scope="col">Glucides</th>
                <th scope="col" class="hide-sm">Boisson</th>
                <th scope="col" class="hide-sm">Sodium</th>
                <th scope="col">Suggestion</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in plan.hours" :key="h.hour">
                <th scope="row" class="num">H{{ h.hour }}</th>
                <td>
                  <span class="bar-cell">
                    <span class="bar" :style="{ width: `${(h.carbsG / maxCarbs) * 100}%` }" aria-hidden="true" />
                    <span class="num">{{ h.carbsG }} g</span>
                  </span>
                </td>
                <td class="num hide-sm">{{ h.fluidMl }} ml</td>
                <td class="num hide-sm">{{ h.sodiumMg }} mg</td>
                <td>{{ h.suggestion }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card" aria-labelledby="advice-title">
        <div class="card-title"><h2 id="advice-title">Conseils</h2></div>
        <ul class="advice">
          <li v-for="a in plan.advice" :key="a">{{ a }}</li>
        </ul>
      </section>
    </template>

    <div v-else class="card intro no-print">
      <p class="text-2">
        Repères : <strong>60 à 90 g de glucides par heure</strong> (jusqu’à 120 g si l’intestin est entraîné), 500 à 700 mg de sodium par litre bu (ISSN),
        et une boisson à la soif modulée par la chaleur. Ajuste les curseurs puis lance le calcul.
      </p>
    </div>
  </section>
</template>

<style scoped>
.stack-lg {
  display: grid;
  gap: var(--space-4);
}
.small {
  font-size: 0.84rem;
}
.calc {
  display: grid;
  gap: var(--space-4);
}
.calc-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
}
.range {
  width: 100%;
  accent-color: var(--accent);
}
.seg {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.seg legend {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 6px;
}
.seg label {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 550;
}
.seg label small {
  color: var(--muted);
}
.seg label.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.seg label:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.kpi {
  display: grid;
  gap: 4px;
}
.kpi svg {
  color: var(--teal);
}
.kpi.carbs svg {
  color: var(--accent);
}
.kpi strong {
  font-size: 1.8rem;
  font-weight: 600;
}
.kpi strong small {
  font-size: 0.85rem;
  color: var(--muted);
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th,
td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
thead th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
tbody th {
  color: var(--text-2);
}
.bar-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 110px;
}
.bar {
  height: 8px;
  border-radius: 0 4px 4px 0;
  background: var(--accent);
  max-width: 70px;
  flex: none;
}
.advice {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: var(--space-2);
  color: var(--text-2);
}
.intro {
  border-left: 3px solid var(--teal);
}
.print-only {
  display: none;
}
@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }
}
@media print {
  .no-print {
    display: none !important;
  }
  .print-only {
    display: block;
  }
  .card {
    box-shadow: none;
    border-color: #ccc;
    break-inside: avoid;
  }
  .kpis {
    grid-template-columns: repeat(4, 1fr);
  }
  .hide-sm {
    display: table-cell !important;
  }
  .bar {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>
