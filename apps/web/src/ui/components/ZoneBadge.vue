<script setup lang="ts">
import { ZONE_LABELS } from '../../domain/format'
import type { Zone } from '../../domain/models'

withDefaults(defineProps<{ zone: Zone; compact?: boolean }>(), { compact: false })
</script>

<template>
  <span class="zone" :style="{ '--zone': `var(--zone-${zone})` }" :title="ZONE_LABELS[zone]">
    <span class="dot" aria-hidden="true" />
    <span>{{ compact ? `Z${zone}` : ZONE_LABELS[zone] }}</span>
  </span>
</template>

<style scoped>
.zone {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-2);
  background: color-mix(in srgb, var(--zone) 14%, transparent);
  white-space: nowrap;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--zone);
}
</style>
