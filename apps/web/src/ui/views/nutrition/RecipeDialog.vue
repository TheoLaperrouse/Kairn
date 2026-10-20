<script setup lang="ts">
import { Minus, Plus, X } from 'lucide-vue-next'
import { nextTick, ref } from 'vue'
import { RECIPE_CATEGORY_LABELS, formatNumber } from '../../../domain/format'
import type { Recipe } from '../../../domain/models'

const dialog = ref<HTMLDialogElement>()
const selected = ref<Recipe>()
const servings = ref(1)

async function open(recipe: Recipe) {
  selected.value = recipe
  servings.value = recipe.servings
  await nextTick()
  dialog.value?.showModal()
}

function close() {
  dialog.value?.close()
}

function scaled(quantity: number): string {
  if (!selected.value) return ''
  const value = (quantity * servings.value) / selected.value.servings
  return formatNumber(value, value < 10 ? 1 : 0)
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="recipe-dialog" :aria-labelledby="selected ? 'recipe-title' : undefined" @click.self="close">
    <article v-if="selected" class="r-detail">
      <header class="r-head">
        <span class="emoji" aria-hidden="true">{{ selected.emoji }}</span>
        <div>
          <p class="eyebrow">{{ RECIPE_CATEGORY_LABELS[selected.category] }}</p>
          <h2 id="recipe-title">{{ selected.name }}</h2>
          <p class="text-2">{{ selected.moment }}</p>
        </div>
        <button type="button" class="btn btn-ghost btn-icon close-btn" aria-label="Fermer" @click="close"><X :size="20" /></button>
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
</template>

<style scoped>
.small {
  font-size: 0.84rem;
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
.emoji {
  font-size: 3rem;
  line-height: 1;
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
  .ingredients li {
    grid-template-columns: 90px 1fr;
  }
  .r-detail {
    padding: var(--space-4);
  }
}
@media print {
  .recipe-dialog {
    display: none !important;
  }
}
</style>
