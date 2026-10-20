<script setup lang="ts">
import { BatteryLow, CalendarClock, CalendarX, Bandage, Thermometer } from 'lucide-vue-next'
import { computed } from 'vue'
import { formatRelative } from '../../domain/format'
import type { AdjustmentReason, PlanAdjustment } from '../../domain/models'

const props = withDefaults(defineProps<{ adjustments: PlanAdjustment[]; limit?: number }>(), { limit: 5 })

const REASONS: Record<AdjustmentReason, { label: string; icon: typeof CalendarClock; tone: string }> = {
  MISSED_SESSION: { label: 'Séance manquée', icon: CalendarClock, tone: 'var(--teal)' },
  ILLNESS: { label: 'Maladie', icon: Thermometer, tone: 'var(--danger)' },
  INJURY: { label: 'Blessure', icon: Bandage, tone: 'var(--danger)' },
  UNAVAILABLE: { label: 'Indisponibilité', icon: CalendarX, tone: 'var(--warning)' },
  FATIGUE: { label: 'Fatigue', icon: BatteryLow, tone: 'var(--warning)' },
}

const items = computed(() => props.adjustments.slice(0, props.limit))
</script>

<template>
  <ol v-if="items.length" class="log">
    <li v-for="a in items" :key="a.id" class="entry">
      <span class="icon" :style="{ color: REASONS[a.reason].tone }" aria-hidden="true">
        <component :is="REASONS[a.reason].icon" :size="18" />
      </span>
      <div class="body">
        <p class="head">
          <strong>{{ a.summary }}</strong>
          <span class="muted when">{{ REASONS[a.reason].label }} · {{ formatRelative(a.createdAt) }}</span>
        </p>
        <ul v-if="a.details.filter(Boolean).length" class="details">
          <li v-for="(detail, i) in a.details.filter(Boolean)" :key="i">{{ detail }}</li>
        </ul>
      </div>
    </li>
  </ol>
  <p v-else class="muted empty">Aucune adaptation pour l’instant : ton plan se déroule comme prévu.</p>
</template>

<style scoped>
.log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}
.entry {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: var(--space-3);
  align-items: start;
}
.icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  align-items: baseline;
}
.when {
  font-size: 0.8rem;
}
.details {
  margin: 4px 0 0;
  padding-left: 1.1em;
  color: var(--text-2);
  font-size: 0.9rem;
  display: grid;
  gap: 2px;
}
.empty {
  font-size: 0.92rem;
}
</style>
