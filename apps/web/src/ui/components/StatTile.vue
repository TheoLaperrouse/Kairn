<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  unit?: string
  sub?: string
  tone?: 'default' | 'accent' | 'teal' | 'success' | 'warning' | 'danger'
}>()
</script>

<template>
  <div class="tile" :class="`tone-${tone ?? 'default'}`">
    <p class="eyebrow">{{ label }}</p>
    <p class="value">
      <span class="num">{{ value }}</span>
      <span v-if="unit" class="unit">{{ unit }}</span>
    </p>
    <p v-if="sub" class="sub"><slot name="icon" />{{ sub }}</p>
    <slot />
  </div>
</template>

<style scoped>
.tile {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  display: grid;
  gap: 6px;
  align-content: start;
  box-shadow: var(--shadow);
  min-width: 0;
}
.value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--font-display);
}
.value .num {
  font-size: 2rem;
  font-weight: 600;
  line-height: 1;
}
.unit {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.95rem;
}
.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-size: 0.85rem;
}
.tone-accent .value .num {
  color: var(--accent);
}
.tone-teal .value .num {
  color: var(--teal);
}
.tone-success .value .num {
  color: var(--success);
}
.tone-warning .value .num {
  color: var(--warning);
}
.tone-danger .value .num {
  color: var(--danger);
}
</style>
