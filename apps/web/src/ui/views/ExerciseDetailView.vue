<script setup lang="ts">
import { TriangleAlert, ArrowLeft, CircleCheck, Mountain, TrendingDown, TrendingUp } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useContentStore } from '../../application/stores/content'
import { CATEGORY_LABELS, errorMessage } from '../../domain/format'
import MotionDemo from '../components/MotionDemo.vue'

const props = defineProps<{ id: string }>()
const content = useContentStore()
const loading = ref(true)
const error = ref('')
const paused = ref(false)

onMounted(async () => {
  try {
    await Promise.all([content.loadExercises(), content.loadRoutines()])
  } catch (e) {
    error.value = errorMessage(e, 'Chargement impossible')
  } finally {
    loading.value = false
  }
})

const exercise = computed(() => content.exercises.find((e) => e.id === props.id))
const usedIn = computed(() => content.routines.filter((r) => r.blocks.some((b) => b.exerciseId === props.id)))
</script>

<template>
  <div class="page">
    <RouterLink to="/exercices" class="btn btn-ghost btn-sm back"><ArrowLeft :size="16" /> Bibliothèque</RouterLink>

    <p v-if="error" class="alert alert-error">{{ error }}</p>
    <p v-else-if="loading" class="muted">Chargement…</p>
    <p v-else-if="!exercise" class="muted">Cet exercice n'existe pas.</p>

    <template v-else>
      <div class="hero">
        <div class="media">
          <div class="stage card">
            <MotionDemo :exercise="exercise" :paused="paused" />
            <button class="btn btn-sm toggle" type="button" @click="paused = !paused">
              {{ paused ? 'Lecture' : 'Pause' }}
            </button>
          </div>
        </div>

        <div class="intro">
          <span class="eyebrow">{{ CATEGORY_LABELS[exercise.category] }} · difficulté {{ exercise.difficulty }}/3</span>
          <h1>{{ exercise.name }}</h1>
          <p class="lead text-2">{{ exercise.description }}</p>

          <div class="benefit">
            <Mountain :size="20" aria-hidden="true" />
            <div>
              <strong>Pourquoi c'est utile en trail</strong>
              <p>{{ exercise.trailBenefit }}</p>
            </div>
          </div>

          <div class="tags">
            <span v-for="m in exercise.muscles" :key="m" class="chip chip-accent">{{ m }}</span>
          </div>
          <p class="muted small">Matériel : {{ exercise.equipment.join(', ') }}</p>

        </div>
      </div>

      <div class="grid grid-2">
        <section class="card">
          <h2 class="card-title">Consignes</h2>
          <ol class="list cues">
            <li v-for="cue in exercise.cues" :key="cue"><CircleCheck :size="18" aria-hidden="true" /> {{ cue }}</li>
          </ol>
        </section>
        <section class="card">
          <h2 class="card-title">Erreurs fréquentes</h2>
          <ul class="list mistakes">
            <li v-for="m in exercise.commonMistakes" :key="m"><TriangleAlert :size="18" aria-hidden="true" /> {{ m }}</li>
          </ul>
        </section>
      </div>

      <div v-if="exercise.regression || exercise.progression" class="grid grid-2">
        <section v-if="exercise.regression" class="card variant">
          <TrendingDown :size="20" aria-hidden="true" />
          <div>
            <h3>Plus facile</h3>
            <p class="text-2">{{ exercise.regression }}</p>
          </div>
        </section>
        <section v-if="exercise.progression" class="card variant">
          <TrendingUp :size="20" aria-hidden="true" />
          <div>
            <h3>Plus difficile</h3>
            <p class="text-2">{{ exercise.progression }}</p>
          </div>
        </section>
      </div>

      <section v-if="usedIn.length" class="stack">
        <h2>Dans les routines</h2>
        <div class="row">
          <RouterLink v-for="r in usedIn" :key="r.id" :to="`/renfo/${r.id}/guidee`" class="chip chip-toggle">
            {{ r.name }} · {{ r.durationMin }} min
          </RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.media {
  display: grid;
  gap: var(--space-3);
  align-content: start;
  min-width: 0;
}
.back {
  justify-self: start;
}
.small {
  font-size: 0.88rem;
}
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: var(--space-5);
  align-items: start;
}
.stage {
  position: relative;
  aspect-ratio: 4 / 3;
  padding: var(--space-4);
  background:
    radial-gradient(circle at 50% 62%, var(--teal-soft), transparent 70%),
    var(--surface);
}
.toggle {
  position: absolute;
  top: 12px;
  right: 12px;
}
.intro {
  display: grid;
  gap: var(--space-3);
}
.intro h1 {
  margin: 2px 0;
}
.benefit {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--accent);
}
.benefit p {
  color: var(--text);
  margin-top: 2px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--space-3);
}
.list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.list svg {
  flex: none;
  margin-top: 2px;
}
.cues svg {
  color: var(--teal);
}
.mistakes svg {
  color: var(--warning);
}
.variant {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}
.variant > svg {
  color: var(--accent);
  flex: none;
  margin-top: 2px;
}
.variant h3 {
  margin-bottom: 4px;
}
@media (max-width: 860px) {
  .hero {
    grid-template-columns: 1fr;
  }
}
</style>
