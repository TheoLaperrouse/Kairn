<script setup lang="ts">
/** Findings of an analysis or summary: icon and title carry the tone, never color alone. */
import { CircleAlert, CircleCheck, Info } from 'lucide-vue-next'
import type { Insight } from '../../domain/models'

defineProps<{ insights: Insight[] }>()

const ICONS = { POSITIVE: CircleCheck, ATTENTION: CircleAlert, INFO: Info } as const
const TONE_LABELS = { POSITIVE: 'Point fort', ATTENTION: 'À surveiller', INFO: 'Info' } as const
</script>

<template>
  <ul class="insights">
    <li v-for="(insight, i) in insights" :key="i" :class="`tone-${insight.tone.toLowerCase()}`">
      <component :is="ICONS[insight.tone]" :size="18" class="icon" aria-hidden="true" />
      <div>
        <strong>
          <span class="visually-hidden">{{ TONE_LABELS[insight.tone] }} : </span>{{ insight.title }}
        </strong>
        <p>{{ insight.text }}</p>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.insights {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}
li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
  align-items: start;
}
.icon {
  margin-top: 2px;
}
.tone-positive .icon {
  color: var(--success);
}
.tone-attention .icon {
  color: var(--warning);
}
.tone-info .icon {
  color: var(--muted);
}
strong {
  display: block;
  margin-bottom: 2px;
}
p {
  margin: 0;
  color: var(--text-2);
  font-size: 0.92rem;
  line-height: 1.5;
}
</style>
