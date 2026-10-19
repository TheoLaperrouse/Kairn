<script setup lang="ts">
import { Clock, Coffee, Droplets, Flame, Minus, Plus, Printer, Search, Snowflake, Sparkles, Wheat, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useContentStore } from '../../application/stores/content'
import { useTrainingStore } from '../../application/stores/training'
import { RECIPE_CATEGORY_LABELS, formatNumber } from '../../domain/format'
import type { FuelingInput, FuelingPlan, Recipe, RecipeCategory } from '../../domain/models'

const content = useContentStore()
const training = useTrainingStore()

const tab = ref<'recettes' | 'course'>('recettes')
const CATEGORIES = Object.keys(RECIPE_CATEGORY_LABELS) as RecipeCategory[]

const category = ref<RecipeCategory | 'TOUTES'>('TOUTES')
const activeTags = ref<string[]>([])
const query = ref('')

onMounted(async () => {
  await content.loadRecipes()
  if (!training.dashboard) await training.loadDashboard().catch(() => {})
  const estimated = training.dashboard?.goal.estimatedDurationH
  if (estimated) fueling.value.durationH = Math.round(estimated * 2) / 2
  if (training.profile?.weightKg) fueling.value.weightKg = training.profile.weightKg
})

const allTags = computed(() => [...new Set(content.recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'fr')))

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const filtered = computed(() => {
  const q = normalize(query.value.trim())
  return content.recipes.filter(
    (r) =>
      (category.value === 'TOUTES' || r.category === category.value) &&
      activeTags.value.every((t) => r.tags.includes(t)) &&
      (!q || normalize(`${r.name} ${r.moment} ${r.ingredients.map((i) => i.name).join(' ')}`).includes(q)),
  )
})

const countByCategory = computed(() => {
  const counts: Record<string, number> = { TOUTES: content.recipes.length }
  for (const r of content.recipes) counts[r.category] = (counts[r.category] ?? 0) + 1
  return counts
})

function toggleTag(tag: string) {
  activeTags.value = activeTags.value.includes(tag) ? activeTags.value.filter((t) => t !== tag) : [...activeTags.value, tag]
}

const dialog = ref<HTMLDialogElement>()
const selected = ref<Recipe>()
const servings = ref(1)

async function openRecipe(recipe: Recipe) {
  selected.value = recipe
  servings.value = recipe.servings
  await nextTick()
  dialog.value?.showModal()
}

function closeRecipe() {
  dialog.value?.close()
}

function scaled(quantity: number): string {
  if (!selected.value) return ''
  const value = (quantity * servings.value) / selected.value.servings
  return formatNumber(value, value < 10 ? 1 : 0)
}

const fueling = ref<FuelingInput>({ durationH: 12, temperatureC: 18, weightKg: 70, sweat: 'MOYEN', gut: 'PARTIEL' })
const plan = ref<FuelingPlan>()
const computing = ref(false)
const fuelingError = ref('')

async function compute() {
  computing.value = true
  fuelingError.value = ''
  try {
    plan.value = await content.fuelingPlan(fueling.value)
  } catch (e) {
    fuelingError.value = e instanceof Error ? e.message : 'Calcul impossible'
  } finally {
    computing.value = false
  }
}

const SWEAT = [
  { value: 'FAIBLE', label: 'Faible' },
  { value: 'MOYEN', label: 'Moyenne' },
  { value: 'FORT', label: 'Forte (traces de sel)' },
] as const
const GUT = [
  { value: 'AUCUN', label: 'Pas entraîné', hint: '≈ 60 g/h' },
  { value: 'PARTIEL', label: 'En cours', hint: '≈ 75 g/h' },
  { value: 'ENTRAINE', label: 'Entraîné', hint: '≈ 90 g/h' },
] as const

const maxCarbs = computed(() => Math.max(...(plan.value?.hours.map((h) => h.carbsG) ?? [1])))

function print() {
  window.print()
}
</script>

<template>
  <div class="page nutrition">
    <header class="page-header no-print">
      <div>
        <p class="eyebrow">Nutrition</p>
        <h1>Carburant de traileur</h1>
        <p class="lead">Des recettes maison pensées pour l’effort long, et un plan de ravitaillement calibré pour ta course.</p>
      </div>
      <div class="tabs" role="tablist" aria-label="Sections nutrition">
        <button role="tab" type="button" :aria-selected="tab === 'recettes'" @click="tab = 'recettes'">Recettes</button>
        <button role="tab" type="button" :aria-selected="tab === 'course'" @click="tab = 'course'">Stratégie de course</button>
      </div>
    </header>

    <section v-if="tab === 'recettes'" class="stack-lg" aria-label="Recettes">
      <div class="filters">
        <div class="cats" role="group" aria-label="Moment">
          <button type="button" class="chip chip-toggle" :aria-pressed="category === 'TOUTES'" @click="category = 'TOUTES'">
            Toutes <span class="count">{{ countByCategory.TOUTES }}</span>
          </button>
          <button v-for="c in CATEGORIES" :key="c" type="button" class="chip chip-toggle" :aria-pressed="category === c" @click="category = c">
            {{ RECIPE_CATEGORY_LABELS[c] }} <span class="count">{{ countByCategory[c] ?? 0 }}</span>
          </button>
        </div>
        <label class="search">
          <Search :size="16" aria-hidden="true" />
          <span class="visually-hidden">Rechercher une recette</span>
          <input v-model="query" type="search" placeholder="Riz, dattes, sans gluten…" />
        </label>
      </div>
      <div class="tags" role="group" aria-label="Filtrer par étiquette">
        <button v-for="t in allTags" :key="t" type="button" class="chip chip-toggle tag" :aria-pressed="activeTags.includes(t)" @click="toggleTag(t)">#{{ t }}</button>
      </div>

      <p v-if="filtered.length === 0" class="muted empty">Aucune recette ne correspond à ces filtres.</p>
      <ul v-else class="recipes">
        <li v-for="r in filtered" :key="r.id">
          <button type="button" class="recipe card" @click="openRecipe(r)">
            <span class="emoji" aria-hidden="true">{{ r.emoji }}</span>
            <span class="cat-label eyebrow">{{ RECIPE_CATEGORY_LABELS[r.category] }}</span>
            <strong class="r-name">{{ r.name }}</strong>
            <span class="r-moment">{{ r.moment }}</span>
            <span class="r-carbs">
              <span class="num big">{{ r.perServing.carbsG }} g</span>
              <span class="muted">glucides · {{ r.servingLabel }}</span>
            </span>
            <span class="r-meta num">
              <span><Clock :size="13" aria-hidden="true" /> {{ r.prepMinutes }} min</span>
              <span><Flame :size="13" aria-hidden="true" /> {{ r.perServing.kcal }} kcal</span>
              <span>{{ r.perServing.proteinG }} g prot.</span>
              <span>{{ r.perServing.sodiumMg }} mg Na</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <section v-else class="stack-lg" aria-label="Stratégie de course">
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

    <dialog ref="dialog" class="recipe-dialog" :aria-labelledby="selected ? 'recipe-title' : undefined" @click.self="closeRecipe">
      <article v-if="selected" class="r-detail">
        <header class="r-head">
          <span class="emoji big-emoji" aria-hidden="true">{{ selected.emoji }}</span>
          <div>
            <p class="eyebrow">{{ RECIPE_CATEGORY_LABELS[selected.category] }}</p>
            <h2 id="recipe-title">{{ selected.name }}</h2>
            <p class="text-2">{{ selected.moment }}</p>
          </div>
          <button type="button" class="btn btn-ghost btn-icon close-btn" aria-label="Fermer" @click="closeRecipe"><X :size="20" /></button>
        </header>

        <div class="macros">
          <div class="macro main"><span class="num">{{ selected.perServing.carbsG }} g</span><small>glucides</small></div>
          <div class="macro"><span class="num">{{ selected.perServing.proteinG }} g</span><small>protéines</small></div>
          <div class="macro"><span class="num">{{ selected.perServing.fatG }} g</span><small>lipides</small></div>
          <div class="macro"><span class="num">{{ selected.perServing.sodiumMg }} mg</span><small>sodium</small></div>
          <div class="macro"><span class="num">{{ selected.perServing.kcal }}</span><small>kcal</small></div>
        </div>
        <p class="muted small">Valeurs pour {{ selected.servingLabel }} · préparation {{ selected.prepMinutes }} min</p>

        <div class="tags-inline">
          <span v-for="t in selected.tags" :key="t" class="chip">#{{ t }}</span>
        </div>

        <section>
          <div class="ing-head">
            <h3>Ingrédients</h3>
            <div class="stepper" role="group" aria-label="Nombre de portions">
              <button type="button" class="btn btn-sm btn-icon" aria-label="Moins de portions" :disabled="servings <= 1" @click="servings--"><Minus :size="16" /></button>
              <span class="num" aria-live="polite">{{ servings }} portion{{ servings > 1 ? 's' : '' }}</span>
              <button type="button" class="btn btn-sm btn-icon" aria-label="Plus de portions" :disabled="servings >= 50" @click="servings++"><Plus :size="16" /></button>
            </div>
          </div>
          <ul class="ingredients">
            <li v-for="ing in selected.ingredients" :key="ing.name">
              <span class="num qty">{{ scaled(ing.quantity) }} {{ ing.unit }}</span>
              <span>{{ ing.name }}</span>
            </li>
          </ul>
        </section>

        <section>
          <h3>Préparation</h3>
          <ol class="steps">
            <li v-for="(s, i) in selected.steps" :key="i">{{ s }}</li>
          </ol>
        </section>

        <div class="boxes">
          <div class="box tip"><strong>Astuce d’ultra-traileur</strong><p>{{ selected.tip }}</p></div>
          <div class="box"><strong>Conservation & transport</strong><p>{{ selected.storage }}</p></div>
        </div>
      </article>
    </dialog>
  </div>
</template>

<style scoped>
.stack-lg {
  display: grid;
  gap: var(--space-4);
}
.small {
  font-size: 0.84rem;
}
.tabs {
  display: inline-grid;
  grid-auto-flow: column;
  padding: 4px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.tabs button {
  border: 0;
  background: none;
  padding: 8px 16px;
  border-radius: 999px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
  white-space: nowrap;
}
.tabs button[aria-selected='true'] {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: space-between;
  align-items: center;
}
.cats,
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.count {
  font-family: var(--font-mono);
  opacity: 0.6;
  font-size: 0.75rem;
}
.tag {
  font-size: 0.78rem;
  padding: 4px 10px;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  min-height: 42px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  flex: 1 1 220px;
  max-width: 320px;
}
.search:focus-within {
  border-color: var(--accent);
}
.search input {
  border: 0;
  background: none;
  outline: none;
  width: 100%;
  min-width: 0;
}
.recipes {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
}
.recipe {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 6px;
  align-content: start;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition:
    transform 0.15s var(--ease),
    border-color 0.15s var(--ease);
}
.recipe:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
}
.emoji {
  font-size: 2rem;
  line-height: 1;
}
.r-name {
  font-family: var(--font-display);
  font-size: 1.08rem;
}
.r-moment {
  color: var(--text-2);
  font-size: 0.86rem;
}
.r-carbs {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: var(--space-2);
  font-size: 0.8rem;
}
.big {
  white-space: nowrap;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--accent);
}
.r-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 0.78rem;
  color: var(--muted);
}
.r-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.empty {
  text-align: center;
  padding: var(--space-6);
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

.recipe-dialog {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  padding: 0;
  width: min(680px, calc(100vw - 24px));
  max-height: calc(100vh - 48px);
  box-shadow: var(--shadow);
}
.recipe-dialog::backdrop {
  background: rgb(5 10 20 / 0.6);
  backdrop-filter: blur(3px);
}
.r-detail {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}
.r-head {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}
.big-emoji {
  font-size: 3rem;
}
.close-btn {
  margin-left: auto;
  flex: none;
}
.macros {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-2);
}
.macro {
  display: grid;
  justify-items: center;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  text-align: center;
}
.macro .num {
  font-weight: 600;
  font-size: 1.05rem;
}
.macro small {
  color: var(--muted);
  font-size: 0.72rem;
}
.macro.main {
  background: var(--accent-soft);
  color: var(--accent);
}
.tags-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ing-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.stepper {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.stepper .btn-icon {
  width: 34px;
}
.ingredients {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 2px;
}
.ingredients li {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: var(--space-3);
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
}
.qty {
  color: var(--teal);
  font-weight: 600;
}
.steps {
  margin: var(--space-2) 0 0;
  padding-left: 1.3em;
  display: grid;
  gap: var(--space-2);
}
.boxes {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
}
.box {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--surface-2);
  display: grid;
  gap: 4px;
  font-size: 0.9rem;
}
.box.tip {
  background: var(--accent-soft);
}
@media (max-width: 640px) {
  .macros {
    grid-template-columns: repeat(3, 1fr);
  }
  .hide-sm {
    display: none;
  }
  .ingredients li {
    grid-template-columns: 90px 1fr;
  }
  .r-detail {
    padding: var(--space-4);
  }
}
@media print {
  .no-print,
  .recipe-dialog {
    display: none !important;
  }
  .print-only {
    display: block;
  }
  .page {
    padding: 0;
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

<style>
@media print {
  .sidebar,
  .topbar,
  .tabbar {
    display: none !important;
  }
  .shell {
    display: block !important;
  }
  body {
    background: #fff !important;
    color: #111 !important;
  }
}
</style>
