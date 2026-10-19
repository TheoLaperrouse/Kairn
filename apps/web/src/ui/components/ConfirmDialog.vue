<script setup lang="ts">
/**
 * Boîte de confirmation basée sur `<dialog>` : piège du focus, Échap et fond gérés par le navigateur.
 */
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean }>(),
  { confirmLabel: 'Confirmer', danger: false },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()

watch(
  () => props.open,
  (open) => {
    if (open && !dialog.value?.open) dialog.value?.showModal()
    if (!open && dialog.value?.open) dialog.value.close()
  },
)
</script>

<template>
  <dialog ref="dialog" class="confirm" aria-labelledby="confirm-title" @cancel.prevent="emit('cancel')" @click.self="emit('cancel')">
    <div class="inner">
      <h2 id="confirm-title">{{ title }}</h2>
      <p class="text-2">{{ message }}</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" autofocus @click="emit('cancel')">Annuler</button>
        <button type="button" class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" @click="emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.confirm {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  padding: 0;
  width: min(420px, calc(100vw - 32px));
  box-shadow: var(--shadow);
}
.confirm::backdrop {
  background: rgb(5 10 20 / 0.6);
  backdrop-filter: blur(3px);
}
.inner {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-5);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
