<script setup lang="ts">
import { CheckCircle2, Copy, LoaderCircle, UploadCloud, XCircle } from 'lucide-vue-next'
import { ref } from 'vue'
import { useActivitiesStore } from '../../../application/stores/activities'
import type { ImportOutcome } from '../../../domain/models'
import { errorMessage } from '../../composables/error-message'

const emit = defineEmits<{ error: [message: string] }>()

const store = useActivitiesStore()
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()

const ACCEPTED = ['.fit', '.gpx', '.tcx']

async function handleFiles(list: FileList | null | undefined) {
  const all = [...(list ?? [])]
  const files = all.filter((f) => ACCEPTED.some((ext) => f.name.toLowerCase().endsWith(ext)))
  const rejected = all.length - files.length
  if (rejected > 0) emit('error', `${rejected} fichier(s) ignoré(s) : seuls les .FIT, .GPX et .TCX sont acceptés.`)
  if (files.length === 0) return
  try {
    await store.importFiles(files)
  } catch (e) {
    emit('error', errorMessage(e, 'Import impossible'))
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void handleFiles(event.dataTransfer?.files)
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  void handleFiles(input.files)
  input.value = ''
}

function outcomeLabel(outcome: ImportOutcome): string {
  return outcome.status === 'IMPORTED' ? outcome.activity.name : outcome.filename
}
</script>

<template>
  <section class="card" aria-labelledby="import-title">
    <div class="card-title"><h2 id="import-title">Importer des fichiers</h2></div>
    <div
      class="dropzone"
      :class="{ dragging, busy: store.busy }"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <LoaderCircle v-if="store.busy" :size="36" class="spin" aria-hidden="true" />
      <UploadCloud v-else :size="36" aria-hidden="true" />
      <p><strong>Glisse tes fichiers ici</strong></p>
      <p class="muted small">.FIT (montre Garmin, Coros, Suunto…), .GPX ou .TCX — plusieurs à la fois</p>
      <button type="button" class="btn btn-sm" :disabled="store.busy" @click="fileInput?.click()">Parcourir…</button>
      <input ref="fileInput" type="file" multiple :accept="ACCEPTED.join(',')" class="visually-hidden" aria-label="Choisir des fichiers d’activité" @change="onPick" />
    </div>

    <ul v-if="store.lastImport.length" class="outcomes" aria-live="polite">
      <li v-for="(o, i) in store.lastImport" :key="i" :class="o.status.toLowerCase()">
        <CheckCircle2 v-if="o.status === 'IMPORTED'" :size="18" aria-hidden="true" />
        <Copy v-else-if="o.status === 'DUPLICATE'" :size="18" aria-hidden="true" />
        <XCircle v-else :size="18" aria-hidden="true" />
        <div>
          <strong>{{ outcomeLabel(o) }}</strong>
          <p v-if="o.status === 'IMPORTED'" class="small">
            <template v-if="o.matchedSessionTitle">✓ rattachée à « {{ o.matchedSessionTitle }} »</template>
            <template v-else>Importée (pas de séance prévue ce jour-là)</template>
          </p>
          <p v-else-if="o.status === 'DUPLICATE'" class="small">Déjà importée, ignorée</p>
          <p v-else class="small">{{ o.reason }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.small {
  font-size: 0.84rem;
}
.dropzone {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  text-align: center;
  padding: var(--space-6) var(--space-4);
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-2);
  transition:
    border-color 0.15s var(--ease),
    background 0.15s var(--ease);
}
.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.dropzone.busy {
  opacity: 0.8;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.outcomes {
  list-style: none;
  padding: 0;
  margin: var(--space-4) 0 0;
  display: grid;
  gap: var(--space-2);
}
.outcomes li {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  min-width: 0;
}
.outcomes li > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.outcomes .imported svg {
  color: var(--success);
}
.outcomes .duplicate svg {
  color: var(--muted);
}
.outcomes .failed svg {
  color: var(--danger);
}
.outcomes svg {
  flex: none;
  margin-top: 2px;
}
</style>
