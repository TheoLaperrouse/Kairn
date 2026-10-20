<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useContentStore } from '../../application/stores/content'
import FuelingStrategy from './nutrition/FuelingStrategy.vue'
import RecipeBrowser from './nutrition/RecipeBrowser.vue'

const content = useContentStore()
const tab = ref<'recipes' | 'course'>('recipes')

onMounted(() => content.loadRecipes())
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
        <button role="tab" type="button" :aria-selected="tab === 'recipes'" @click="tab = 'recipes'">Recettes</button>
        <button role="tab" type="button" :aria-selected="tab === 'course'" @click="tab = 'course'">Stratégie de course</button>
      </div>
    </header>

    <!-- Filters and calculator state are kept when switching tabs. -->
    <KeepAlive>
      <RecipeBrowser v-if="tab === 'recipes'" />
      <FuelingStrategy v-else />
    </KeepAlive>
  </div>
</template>

<style scoped>
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
@media print {
  .no-print {
    display: none !important;
  }
  .page {
    padding: 0;
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
