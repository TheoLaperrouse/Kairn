<script setup lang="ts">
import { CalendarPlus, Check, Copy, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useNotificationsStore } from '../../application/stores/notifications'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useNotificationsStore()
const copied = ref(false)
const confirming = ref(false)
const error = ref('')

onMounted(() => store.loadCalendar().catch((e: Error) => (error.value = e.message)))

const webcal = computed(() => store.calendarUrl?.replace(/^https?:\/\//, 'webcal://'))
const google = computed(() => (webcal.value ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal.value)}` : undefined))

async function copy() {
  if (!store.calendarUrl) return
  try {
    await navigator.clipboard.writeText(store.calendarUrl)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    /* presse-papiers indisponible : le lien reste sélectionnable */
  }
}

async function regenerate() {
  confirming.value = false
  await store.regenerateCalendar()
}
</script>

<template>
  <section class="card" aria-labelledby="calendar-title">
    <div class="card-title">
      <h2 id="calendar-title"><CalendarPlus :size="20" aria-hidden="true" /> Plan dans ton agenda</h2>
    </div>
    <p class="text-2 small">
      Chaque séance apparaît sur une journée dans ton agenda, avec son détail et un lien vers Kairn. Les changements (séance déplacée, allégée…)
      suivent automatiquement.
    </p>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <template v-if="store.calendarUrl">
      <div class="row actions">
        <a :href="webcal" class="btn btn-sm btn-primary">Apple Calendrier / Outlook</a>
        <a :href="google" target="_blank" rel="noopener" class="btn btn-sm">Google Agenda</a>
      </div>
      <div class="link">
        <input class="input" readonly :value="store.calendarUrl" aria-label="Lien d’abonnement de l’agenda" @focus="($event.target as HTMLInputElement).select()" />
        <button type="button" class="btn btn-sm btn-ghost" @click="copy">
          <component :is="copied ? Check : Copy" :size="16" aria-hidden="true" /> {{ copied ? 'Copié' : 'Copier' }}
        </button>
      </div>
      <p class="small muted">
        Ce lien est personnel : quiconque le possède voit ton plan.
        Google Agenda met à jour l’abonnement toutes les quelques heures, Apple toutes les heures.
        <button type="button" class="linklike" @click="confirming = true"><RefreshCw :size="13" aria-hidden="true" /> Générer un nouveau lien</button>
      </p>
    </template>

    <ConfirmDialog
      :open="confirming"
      title="Générer un nouveau lien ?"
      message="L’ancien lien cessera de fonctionner : il faudra réabonner tes agendas avec le nouveau."
      confirm-label="Nouveau lien"
      @confirm="regenerate"
      @cancel="confirming = false"
    />
  </section>
</template>

<style scoped>
.card-title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.actions {
  flex-wrap: wrap;
  margin: var(--space-3) 0;
}
.link {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.link .input {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  min-height: 38px;
  padding: 6px 10px;
}
.linklike {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  cursor: pointer;
}
</style>
