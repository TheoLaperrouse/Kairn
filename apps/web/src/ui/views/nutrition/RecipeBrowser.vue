<script setup lang="ts">
import { Clock, Flame, Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useContentStore } from '../../../application/stores/content'
import { RECIPE_CATEGORY_LABELS } from '../../../domain/format'
import type { RecipeCategory } from '../../../domain/models'
import RecipeDialog from './RecipeDialog.vue'

const content = useContentStore()

const CATEGORIES = Object.keys(RECIPE_CATEGORY_LABELS) as RecipeCategory[]

const category = ref<RecipeCategory | 'ALL'>('ALL')
const activeTags = ref<string[]>([])
const query = ref('')
const dialog = ref<InstanceType<typeof RecipeDialog>>()

const allTags = computed(() => [...new Set(content.recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'fr')))

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const filtered = computed(() => {
  const q = normalize(query.value.trim())
  return content.recipes.filter(
    (r) =>
      (category.value === 'ALL' || r.category === category.value) &&
      activeTags.value.every((t) => r.tags.includes(t)) &&
      (!q || normalize(`${r.name} ${r.moment} ${r.ingredients.map((i) => i.name).join(' ')}`).includes(q)),
  )
})

const countByCategory = computed(() => {
  const counts: Record<string, number> = { ALL: content.recipes.length }
  for (const r of content.recipes) counts[r.category] = (counts[r.category] ?? 0) + 1
  return counts
})

function toggleTag(tag: string) {
  activeTags.value = activeTags.value.includes(tag) ? activeTags.value.filter((t) => t !== tag) : [...activeTags.value, tag]
}
</script>

<template>
  <section class="stack-lg" aria-label="Recettes">
    <div class="filters">
      <div class="cats" role="group" aria-label="Moment">
        <button type="button" class="chip chip-toggle" :aria-pressed="category === 'ALL'" @click="category = 'ALL'">
          Toutes <span class="count">{{ countByCategory.ALL }}</span>
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
        <button type="button" class="recipe card" @click="dialog?.open(r)">
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

    <RecipeDialog ref="dialog" />
  </section>
</template>

<style scoped>
.stack-lg {
  display: grid;
  gap: var(--space-4);
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
@media print {
  .card {
    box-shadow: none;
    border-color: #ccc;
    break-inside: avoid;
  }
}
</style>
