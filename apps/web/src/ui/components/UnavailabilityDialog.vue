<script setup lang="ts">
/**
 * Declares a period without running (illness, injury, unavailability):
 * the plan is adapted, then a gradual return is scheduled.
 */
import { Bandage, CalendarX, CircleCheck, Thermometer, TriangleAlert, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useTrainingStore } from '../../application/stores/training'
import { errorMessage, todayIso } from '../../domain/format'
import type { PlanAdjustment, Unavailability } from '../../domain/models'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const training = useTrainingStore()
const dialog = ref<HTMLDialogElement>()

const REASONS = [
  { value: 'ILLNESS', label: 'Malade', hint: 'Rhume, grippe, gastro…', icon: Thermometer },
  { value: 'INJURY', label: 'Blessé', hint: 'Douleur qui empêche de courir', icon: Bandage },
  { value: 'UNAVAILABLE', label: 'Indisponible', hint: 'Voyage, travail, famille', icon: CalendarX },
] as const

const reason = ref<Unavailability['reason']>('ILLNESS')
const from = ref(todayIso())
const to = ref(todayIso())
const crossTrainingOk = ref(true)
const busy = ref(false)
const error = ref<string>()
const result = ref<PlanAdjustment>()

watch(
  () => props.open,
  (open) => {
    if (open) {
      result.value = undefined
      error.value = undefined
      from.value = todayIso()
      to.value = todayIso()
      if (!dialog.value?.open) dialog.value?.showModal()
    } else if (dialog.value?.open) dialog.value.close()
  },
)

const days = computed(() => {
  const ms = Date.parse(`${to.value}T00:00:00Z`) - Date.parse(`${from.value}T00:00:00Z`)
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) + 1 : 0
})

const explanation = computed(() => {
  const n = Math.max(days.value, 0)
  const period = `ces ${n} jour${n > 1 ? 's' : ''}`
  if (reason.value === 'INJURY') {
    const recovery = `${Math.min(Math.round(n * 1.5), 21)} jours de reprise progressive, sans intensité.`
    return crossTrainingOk.value
      ? `Pendant ${period}, tes sorties deviennent des séances sans impact (vélo, natation, elliptique). Ensuite, ${recovery}`
      : `Les séances de ${period} sont annulées, puis ${recovery}`
  }
  if (reason.value === 'UNAVAILABLE' && n < 5) return `Les séances de ${period} sont annulées, le reste du plan est inchangé.`
  return `Les séances de ${period} sont annulées, puis ${Math.min(n, 21)} jours de reprise : volume de 50 % à 90 %, sans intensité.`
})

async function submit() {
  if (to.value < from.value) {
    error.value = 'La date de fin doit suivre la date de début.'
    return
  }
  busy.value = true
  error.value = undefined
  try {
    result.value = await training.declareUnavailability({
      from: from.value,
      to: to.value,
      reason: reason.value,
      crossTrainingOk: reason.value === 'INJURY' && crossTrainingOk.value,
    })
  } catch (e) {
    error.value = errorMessage(e, 'Impossible d’adapter le plan')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="sheet" aria-labelledby="unavail-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="inner">
      <div class="head">
        <h2 id="unavail-title">{{ result ? 'Plan adapté' : 'Adapter mon plan' }}</h2>
        <button type="button" class="btn btn-ghost btn-icon" aria-label="Fermer" @click="emit('close')"><X :size="20" /></button>
      </div>

      <template v-if="result">
        <p class="done"><CircleCheck :size="20" aria-hidden="true" /> {{ result.summary }}</p>
        <ul class="details">
          <li v-for="(d, i) in result.details" :key="i">{{ d }}</li>
        </ul>
        <div class="actions"><button type="button" class="btn btn-primary" autofocus @click="emit('close')">Compris</button></div>
      </template>

      <form v-else class="stack" @submit.prevent="submit">
        <fieldset class="reasons">
          <legend class="visually-hidden">Motif</legend>
          <label v-for="r in REASONS" :key="r.value" class="reason" :class="{ selected: reason === r.value }">
            <input v-model="reason" type="radio" name="reason" :value="r.value" class="visually-hidden" />
            <component :is="r.icon" :size="22" aria-hidden="true" />
            <strong>{{ r.label }}</strong>
            <small class="muted">{{ r.hint }}</small>
          </label>
        </fieldset>

        <div class="dates">
          <label class="field"><span>Du</span><input v-model="from" class="input" type="date" required /></label>
          <label class="field"><span>Au (inclus)</span><input v-model="to" class="input" type="date" :min="from" required /></label>
        </div>

        <label v-if="reason === 'INJURY'" class="switch">
          <span>Je peux faire du vélo, de la natation ou de l’elliptique</span>
          <input v-model="crossTrainingOk" type="checkbox" />
        </label>

        <p class="explain">{{ explanation }}</p>
        <p v-if="reason === 'INJURY'" class="muted small">Une douleur qui persiste plus de quelques jours mérite l’avis d’un professionnel de santé.</p>
        <p v-if="error" class="alert alert-error" role="alert"><TriangleAlert :size="18" aria-hidden="true" /> {{ error }}</p>

        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="emit('close')">Annuler</button>
          <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Adaptation…' : 'Adapter mon plan' }}</button>
        </div>
      </form>
    </div>
  </dialog>
</template>

<style scoped>
.sheet {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  padding: 0;
  width: min(520px, calc(100vw - 32px));
  box-shadow: var(--shadow);
}
.sheet::backdrop {
  background: rgb(5 10 20 / 0.6);
  backdrop-filter: blur(3px);
}
.inner {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.reasons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  border: 0;
  padding: 0;
  margin: 0;
}
.reason {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 4px;
  padding: var(--space-3) var(--space-2);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  color: var(--text-2);
}
.reason.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--text);
}
.reason:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.reason small {
  font-size: 0.72rem;
  line-height: 1.25;
}
.dates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.explain {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--teal-soft);
  font-size: 0.92rem;
}
.small {
  font-size: 0.82rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.done {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--success);
  font-weight: 600;
}
.details {
  margin: 0;
  padding-left: 1.2em;
  color: var(--text-2);
  display: grid;
  gap: 4px;
}
@media (max-width: 480px) {
  .reasons,
  .dates {
    grid-template-columns: 1fr;
  }
  .reason {
    grid-template-columns: auto auto 1fr;
    justify-items: start;
    text-align: left;
    align-items: center;
  }
}
</style>
