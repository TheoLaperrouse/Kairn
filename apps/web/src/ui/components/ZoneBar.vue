<script setup lang="ts">
/** Temps passé dans chaque zone cardiaque : barre empilée à 100 % et légende chiffrée. */
import { computed, ref } from 'vue'
import { ZONE_LABELS, formatSeconds } from '../../domain/format'
import type { TimeInZones, Zone } from '../../domain/models'

const props = defineProps<{
  seconds: TimeInZones
  /** Zone visée par la séance, signalée dans la légende. */
  target?: Zone
}>()

const ZONES: Zone[] = [1, 2, 3, 4, 5]
const total = computed(() => ZONES.reduce((sum, z) => sum + props.seconds[z], 0))
const rows = computed(() =>
  ZONES.map((zone) => ({
    zone,
    seconds: props.seconds[zone],
    share: total.value ? props.seconds[zone] / total.value : 0,
  })),
)
const visible = computed(() => rows.value.filter((r) => r.share >= 0.005))
const hovered = ref<Zone>()
const pct = (share: number) => `${Math.round(share * 100)} %`
const ariaLabel = computed(() => rows.value.map((r) => `${ZONE_LABELS[r.zone]} ${pct(r.share)}`).join(', '))
</script>

<template>
  <div class="zones">
    <div class="bar" role="img" :aria-label="ariaLabel">
      <span
        v-for="r in visible"
        :key="r.zone"
        class="segment"
        :class="{ dim: hovered && hovered !== r.zone }"
        :style="{ flexGrow: r.share, background: `var(--zone-${r.zone})` }"
        :title="`${ZONE_LABELS[r.zone]} : ${formatSeconds(r.seconds)} (${pct(r.share)})`"
        @pointerenter="hovered = r.zone"
        @pointerleave="hovered = undefined"
      />
    </div>
    <ul class="legend">
      <li
        v-for="r in rows"
        :key="r.zone"
        :class="{ active: hovered === r.zone, empty: r.share < 0.005 }"
        @pointerenter="hovered = r.zone"
        @pointerleave="hovered = undefined"
      >
        <i class="swatch" :style="{ background: `var(--zone-${r.zone})` }" aria-hidden="true" />
        <span class="label">{{ ZONE_LABELS[r.zone] }}<span v-if="target === r.zone" class="target">visée</span></span>
        <span class="num time">{{ formatSeconds(r.seconds) }}</span>
        <strong class="num share">{{ pct(r.share) }}</strong>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.zones {
  display: grid;
  gap: var(--space-3);
}
.bar {
  display: flex;
  gap: 2px;
  height: 14px;
  border-radius: 4px;
  overflow: hidden;
}
.segment {
  flex-basis: 0;
  min-width: 3px;
  transition: opacity 0.15s var(--ease);
}
.segment.dim {
  opacity: 0.35;
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
}
.legend li {
  display: grid;
  grid-template-columns: auto 1fr auto 3.2em;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 0.88rem;
}
.legend li.active {
  background: var(--surface-2);
}
.legend li.empty {
  color: var(--muted);
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.label {
  color: var(--text-2);
}
.target {
  margin-left: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  color: var(--text);
}
.time {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.share {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
