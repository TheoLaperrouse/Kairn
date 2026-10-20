<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { useContentStore } from '../../../application/stores/content'
import { formatDuration } from '../../../domain/format'
import type { RoutineDetail } from '../../../domain/models'
import ExerciseFigure from '../../components/ExerciseFigure.vue'

const props = defineProps<{ routineId: string; sessionId: string }>()
const content = useContentStore()
const routine = ref<RoutineDetail>()

watch(
  () => props.routineId,
  async (id) => {
    if (routine.value?.id !== id) routine.value = await content.routine(id).catch(() => undefined)
  },
  { immediate: true },
)

const exerciseOf = (id: string) => routine.value?.exercises.find((e) => e.id === id)
</script>

<template>
  <section class="card routine" aria-labelledby="routine-title">
    <div class="card-title">
      <div>
        <h2 id="routine-title">{{ routine?.name ?? 'Routine de renforcement' }}</h2>
        <p v-if="routine" class="text-2 sub">{{ routine.focus }} · {{ formatDuration(routine.durationMin) }}</p>
      </div>
    </div>
    <RouterLink :to="`/renfo/${routineId}/guidee?seance=${sessionId}`" class="btn btn-primary launch">
      <Play :size="20" aria-hidden="true" /> Lancer la séance guidée
    </RouterLink>
    <p v-if="routine" class="text-2 desc">{{ routine.description }}</p>
    <ol v-if="routine" class="blocks">
      <li v-for="(block, i) in routine.blocks" :key="i" class="block">
        <RouterLink :to="`/exercices/${block.exerciseId}`" class="block-figure" :aria-label="`Voir l’exercice ${exerciseOf(block.exerciseId)?.name ?? ''}`">
          <ExerciseFigure v-if="exerciseOf(block.exerciseId)" :exercise="exerciseOf(block.exerciseId)!" :show-labels="false" />
        </RouterLink>
        <div class="block-info">
          <p class="block-name">{{ exerciseOf(block.exerciseId)?.name ?? block.exerciseId }}</p>
          <p class="block-dose">
            <strong class="num">{{ block.sets }} ×
              <template v-if="block.reps">{{ block.reps }} rép.</template>
              <template v-else-if="block.durationSec">{{ block.durationSec }} s</template>
            </strong>
            <span v-if="block.perSide" class="chip">par côté</span>
            <span v-if="block.tempo" class="chip chip-teal">tempo {{ block.tempo }}</span>
            <span class="muted">repos {{ block.restSec }} s</span>
          </p>
          <p v-if="block.notes" class="muted block-notes">{{ block.notes }}</p>
        </div>
      </li>
    </ol>
    <div v-else class="muted">Chargement de la routine…</div>
  </section>
</template>

<style scoped>
.sub {
  font-size: 0.9rem;
  margin-top: 4px;
}
.launch {
  width: 100%;
  min-height: 56px;
  font-size: 1.05rem;
}
.desc {
  margin-top: var(--space-4);
}
.blocks {
  list-style: none;
  margin: var(--space-4) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: var(--space-3);
}
.block {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2);
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.block-figure {
  flex: none;
  width: 92px;
  height: 92px;
  border-radius: 12px;
  background: var(--surface);
  padding: 4px;
}
.block-info {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.block-name {
  font-weight: 650;
}
.block-dose {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 0.85rem;
}
.block-notes {
  font-size: 0.8rem;
}
</style>
