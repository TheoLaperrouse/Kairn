<script setup lang="ts">
import { Check, Sparkles, Star, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { DAYS_SHORT, SESSION_TYPE_LABELS, formatDuration, formatShortDate, weekdayOf } from '../../domain/format'
import type { PlannedSession } from '../../domain/models'
import ZoneBadge from './ZoneBadge.vue'
import { SESSION_ICONS } from './session-icons'

const props = withDefaults(defineProps<{ session: PlannedSession; compact?: boolean; showDate?: boolean }>(), {
  compact: false,
  showDate: true,
})

const icon = computed(() => SESSION_ICONS[props.session.type])
const statusLabel = computed(() =>
  props.session.status === 'DONE' ? 'Faite' : props.session.status === 'SKIPPED' ? 'Pas faite' : undefined,
)
</script>

<template>
  <RouterLink
    :to="`/seance/${session.id}`"
    class="session"
    :class="[`sport-${session.sport.toLowerCase()}`, `status-${session.status.toLowerCase()}`, { compact, key: session.keySession }]"
    :aria-label="`${session.title}, ${formatDuration(session.durationMin)}${statusLabel ? ', ' + statusLabel : ''}${session.adjustment ? ', adaptée' : ''}`"
  >
    <span class="icon" aria-hidden="true"><component :is="icon" :size="compact ? 16 : 20" /></span>
    <span v-if="compact && session.adjustment" class="adjusted-dot" :title="session.adjustment" aria-hidden="true" />
    <span class="body">
      <span v-if="showDate && !compact" class="date">{{ DAYS_SHORT[weekdayOf(session.date)] }} {{ formatShortDate(session.date) }}</span>
      <span class="title">{{ compact ? SESSION_TYPE_LABELS[session.type] : session.title }}</span>
      <span class="meta">
        <span class="num">{{ formatDuration(session.durationMin) }}</span>
        <template v-if="session.distanceKm && !compact">
          <span class="sep">·</span><span class="num">{{ session.distanceKm }} km</span>
        </template>
        <template v-if="session.elevationGainM && !compact">
          <span class="sep">·</span><span class="num">{{ session.elevationGainM }} m D+</span>
        </template>
      </span>
      <span v-if="!compact" class="tags">
        <ZoneBadge v-if="session.sport !== 'STRENGTH'" :zone="session.zone" />
        <span v-if="session.keySession" class="chip chip-accent"><Star :size="12" aria-hidden="true" /> Séance clé</span>
        <span v-if="session.adjustment" class="chip chip-teal" :title="session.adjustment">
          <Sparkles :size="12" aria-hidden="true" />
          {{ session.originalDate ? `Déplacée du ${formatShortDate(session.originalDate)}` : 'Adaptée' }}
        </span>
      </span>
    </span>
    <span v-if="statusLabel" class="status" :title="statusLabel">
      <Check v-if="session.status === 'DONE'" :size="compact ? 13 : 16" aria-hidden="true" />
      <X v-else :size="compact ? 13 : 16" aria-hidden="true" />
      <span v-if="!compact" class="status-text">{{ statusLabel }}</span>
    </span>
  </RouterLink>
</template>

<style scoped>
.adjusted-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--teal);
}
.session {
  --tone: var(--teal);
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  text-decoration: none;
  min-width: 0;
  transition:
    border-color 0.15s var(--ease),
    transform 0.15s var(--ease);
}
.session:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
.sport-bike {
  --tone: var(--series-form);
}
.sport-strength {
  --tone: var(--warning);
}
.key {
  --tone: var(--accent);
}
.icon {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 14%, transparent);
}
.body {
  display: grid;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.date {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: capitalize;
  color: var(--muted);
}
.title {
  font-weight: 650;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 0.82rem;
  color: var(--text-2);
}
.sep {
  color: var(--muted);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.status {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
}
.status-done .status {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
}
.status-skipped .status {
  color: var(--muted);
  background: var(--surface-3);
}
.status-skipped .title {
  text-decoration: line-through;
  color: var(--muted);
}
.status-done {
  border-color: color-mix(in srgb, var(--success) 35%, var(--border));
}

/* Variante compacte (grille de la semaine) */
.compact {
  flex-direction: column;
  gap: 6px;
  padding: var(--space-2) var(--space-3);
  border-radius: 12px;
}
.compact .icon {
  width: 28px;
  height: 28px;
  border-radius: 9px;
}
.compact .title {
  font-size: 0.82rem;
}
.compact .meta {
  font-size: 0.75rem;
}
.compact .status {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 3px;
}
</style>
