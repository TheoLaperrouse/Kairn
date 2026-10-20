<script setup lang="ts">
import { Clock, Play, Search } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useContentStore } from '../../application/stores/content'
import { CATEGORY_LABELS, errorMessage, PHASE_LABELS } from '../../domain/format'
import type { ExerciseCategory } from '../../domain/models'
import ExerciseFigure from '../components/ExerciseFigure.vue'

const content = useContentStore()
const loading = ref(true)
const error = ref('')
const query = ref('')
const category = ref<ExerciseCategory | 'TOUS'>('TOUS')
const hovered = ref<string>()
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

onMounted(async () => {
  try {
    await Promise.all([content.loadExercises(), content.loadRoutines()])
  } catch (e) {
    error.value = errorMessage(e, 'Chargement impossible')
  } finally {
    loading.value = false
  }
})

const categories = computed(() => {
  const present = new Set(content.exercises.map((e) => e.category))
  return (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).filter((c) => present.has(c))
})

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const filtered = computed(() => {
  const q = normalize(query.value.trim())
  return content.exercises.filter(
    (e) =>
      (category.value === 'TOUS' || e.category === category.value) &&
      (!q || normalize([e.name, e.description, ...e.muscles].join(' ')).includes(q)),
  )
})

function countFor(c: ExerciseCategory) {
  return content.exercises.filter((e) => e.category === c).length
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <span class="eyebrow">Renforcement</span>
        <h1>Blinder les jambes pour la descente</h1>
        <p class="lead">
          Routines guidées à suivre en direct et bibliothèque d'exercices spécifiques trail, avec démonstration animée et
          muscles sollicités.
        </p>
      </div>
    </header>

    <p v-if="error" class="alert alert-error">{{ error }}</p>

    <section v-if="content.routines.length" aria-labelledby="routines-title" class="stack">
      <h2 id="routines-title">Routines guidées</h2>
      <div class="routines">
        <article v-for="routine in content.routines" :key="routine.id" class="routine card topo">
          <div class="routine-top">
            <span class="chip"><Clock :size="13" aria-hidden="true" /> {{ routine.durationMin }} min</span>
            <span class="muted small">{{ routine.blocks.length }} exercices</span>
          </div>
          <h3>{{ routine.name }}</h3>
          <p class="text-2 small">{{ routine.focus }}</p>
          <div class="phases">
            <span v-for="phase in routine.phases" :key="phase" class="chip chip-teal">{{ PHASE_LABELS[phase] }}</span>
          </div>
          <RouterLink :to="`/renfo/${routine.id}/guidee`" class="btn btn-primary btn-sm launch">
            <Play :size="16" aria-hidden="true" /> Lancer
          </RouterLink>
        </article>
      </div>
    </section>

    <section aria-labelledby="library-title" class="stack">
      <div class="library-head">
        <h2 id="library-title">Bibliothèque d'exercices</h2>
        <label class="search">
          <Search :size="17" aria-hidden="true" />
          <span class="visually-hidden">Rechercher un exercice</span>
          <input v-model="query" type="search" placeholder="Squat, mollets, gainage…" />
        </label>
      </div>
      <div class="row" role="group" aria-label="Filtrer par catégorie">
        <button class="chip chip-toggle" type="button" :aria-pressed="category === 'TOUS'" @click="category = 'TOUS'">
          Tous <span class="count">{{ content.exercises.length }}</span>
        </button>
        <button
          v-for="c in categories"
          :key="c"
          class="chip chip-toggle"
          type="button"
          :aria-pressed="category === c"
          @click="category = c"
        >
          {{ CATEGORY_LABELS[c] }} <span class="count">{{ countFor(c) }}</span>
        </button>
      </div>

      <p v-if="loading" class="muted">Chargement des exercices…</p>
      <p v-else-if="filtered.length === 0" class="empty muted">Aucun exercice ne correspond à « {{ query }} ».</p>

      <div v-else class="exercise-grid">
        <RouterLink
          v-for="exercise in filtered"
          :key="exercise.id"
          :to="`/exercices/${exercise.id}`"
          class="exercise card"
          @mouseenter="hovered = exercise.id"
          @mouseleave="hovered = undefined"
          @focus="hovered = exercise.id"
          @blur="hovered = undefined"
        >
          <div class="thumb">
            <ExerciseFigure :exercise="exercise" :paused="!reducedMotion && hovered !== exercise.id" :show-labels="false" />
          </div>
          <div class="exercise-body">
            <div class="row between">
              <span class="eyebrow">{{ CATEGORY_LABELS[exercise.category] }}</span>
              <span class="difficulty" :aria-label="`Difficulté ${exercise.difficulty} sur 3`">
                <i v-for="n in 3" :key="n" :class="{ on: n <= exercise.difficulty }" />
              </span>
            </div>
            <h3>{{ exercise.name }}</h3>
            <p class="muscles">{{ exercise.muscles.slice(0, 3).join(' · ') }}</p>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.small {
  font-size: 0.88rem;
}
.routines {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(250px, 1fr);
  gap: var(--space-4);
  overflow-x: auto;
  padding-bottom: var(--space-2);
  scroll-snap-type: x mandatory;
}
.routine {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  scroll-snap-align: start;
  padding: var(--space-4);
}
.routine-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.phases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.launch {
  justify-self: start;
  margin-top: var(--space-2);
}
.library-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
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
  color: var(--muted);
  width: min(320px, 100%);
}
.search:focus-within {
  border-color: var(--accent);
}
.search input {
  border: 0;
  background: none;
  outline: none;
  flex: 1;
  min-width: 0;
  color: var(--text);
}
.count {
  opacity: 0.6;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}
.empty {
  padding: var(--space-6) 0;
  text-align: center;
}
.exercise-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
  gap: var(--space-4);
}
.exercise {
  padding: 0;
  overflow: hidden;
  text-decoration: none;
  display: grid;
  grid-template-rows: auto 1fr;
  transition:
    transform 0.2s var(--ease),
    border-color 0.2s var(--ease);
}
.exercise:hover,
.exercise:focus-visible {
  transform: translateY(-3px);
  border-color: var(--accent);
}
.thumb {
  aspect-ratio: 4 / 3;
  padding: var(--space-3);
  background:
    radial-gradient(circle at 50% 65%, var(--teal-soft), transparent 70%),
    var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.exercise-body {
  padding: var(--space-3) var(--space-4) var(--space-4);
  display: grid;
  gap: 4px;
  align-content: start;
}
.between {
  justify-content: space-between;
}
.muscles {
  color: var(--muted);
  font-size: 0.85rem;
}
.difficulty {
  display: inline-flex;
  gap: 3px;
}
.difficulty i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--surface-3);
}
.difficulty i.on {
  background: var(--accent);
}
</style>
