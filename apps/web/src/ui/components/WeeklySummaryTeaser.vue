<script setup lang="ts">
/** Aperçu du dernier bilan hebdomadaire sur le tableau de bord. */
import { ArrowRight, CalendarCheck, CircleAlert, CircleCheck, Info } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useApi } from '../../application/api-provider'
import { formatWeekRange } from '../../domain/format'
import type { WeeklySummary } from '../../domain/models'

const api = useApi()
const summary = ref<WeeklySummary | null>()
onMounted(async () => {
  summary.value = await api.weeklySummary().catch(() => null)
})

const ICONS = { POSITIVE: CircleCheck, ATTENTION: CircleAlert, INFO: Info } as const
/** Les points d'attention d'abord : ce sont eux qui demandent une action. */
const top = computed(() =>
  [...(summary.value?.insights ?? [])].sort((a, b) => (a.tone === 'ATTENTION' ? -1 : 0) - (b.tone === 'ATTENTION' ? -1 : 0)).slice(0, 3),
)
const visible = computed(() => summary.value && (summary.value.totals.activities > 0 || summary.value.sessions.planned > 0))
</script>

<template>
  <section v-if="visible && summary" class="card teaser" aria-labelledby="teaser-title">
    <div class="card-title">
      <h2 id="teaser-title"><CalendarCheck :size="18" aria-hidden="true" /> Bilan · semaine du {{ formatWeekRange(summary.weekStart) }}</h2>
      <span v-if="summary.inProgress" class="chip">en cours</span>
    </div>
    <p class="headline">{{ summary.headline }}</p>
    <ul v-if="top.length" class="points">
      <li v-for="(insight, i) in top" :key="i" :class="`tone-${insight.tone.toLowerCase()}`">
        <component :is="ICONS[insight.tone]" :size="16" aria-hidden="true" /> {{ insight.title }}
      </li>
    </ul>
    <RouterLink :to="`/bilan/${summary.weekStart}`" class="btn btn-sm">Voir le bilan <ArrowRight :size="16" aria-hidden="true" /></RouterLink>
  </section>
</template>

<style scoped>
.teaser {
  display: grid;
  gap: var(--space-3);
}
.card-title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.headline {
  margin: 0;
  font-weight: 600;
}
.points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  font-size: 0.9rem;
  color: var(--text-2);
}
.points li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tone-positive svg {
  color: var(--success);
}
.tone-attention svg {
  color: var(--warning);
}
.tone-info svg {
  color: var(--muted);
}
.teaser .btn {
  justify-self: start;
}
</style>
