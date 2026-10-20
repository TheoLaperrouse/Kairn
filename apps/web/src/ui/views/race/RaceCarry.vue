<script setup lang="ts">
import { Droplets, Moon } from 'lucide-vue-next'
import { computed } from 'vue'
import { formatNumber } from '../../../domain/format'
import type { Split } from '../../../domain/models'
import { formatHours } from '../../../domain/race-time'

const props = defineProps<{ splits: Split[] }>()

/** Ligne de départ + chaque point de passage, pour les fiches « à emporter ». */
const legs = computed(() => props.splits.map((split, i, all) => ({ from: i === 0 ? 'Départ' : all[i - 1]!.name, split })))
</script>

<template>
  <section class="carry-section">
    <h2>À emporter par section</h2>
    <div class="grid grid-3">
      <article v-for="(leg, i) in legs" :key="`l${i}`" class="card carry">
        <p class="eyebrow">{{ leg.from }} → {{ leg.split.name }}</p>
        <p class="carry-time num">{{ formatHours(leg.split.legDurationH) }}<Moon v-if="leg.split.night" :size="14" class="moon" aria-label="De nuit" /></p>
        <div class="macros">
          <span><strong class="num">{{ formatNumber(leg.split.nutrition.carbsG) }} g</strong> glucides</span>
          <span><Droplets :size="14" aria-hidden="true" /><strong class="num">{{ formatNumber(leg.split.nutrition.fluidMl / 1000, 1) }} L</strong></span>
          <span><strong class="num">{{ formatNumber(leg.split.nutrition.sodiumMg) }} mg</strong> sodium</span>
        </div>
        <ul class="carry-list">
          <li v-for="item in leg.split.nutrition.carry" :key="item">{{ item }}</li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.moon {
  color: var(--series-form);
  vertical-align: -2px;
  margin-left: 4px;
}
.carry-section {
  display: grid;
  gap: var(--space-3);
}
.carry {
  display: grid;
  gap: var(--space-2);
  align-content: start;
}
.carry-time {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: var(--font-display);
}
.macros {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.86rem;
  color: var(--text-2);
}
.macros span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.macros strong {
  color: var(--accent);
}
.carry-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-2);
  font-size: 0.88rem;
  display: grid;
  gap: 4px;
}
</style>
