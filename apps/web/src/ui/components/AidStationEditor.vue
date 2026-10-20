<script setup lang="ts">
/**
 * Aid station editor: name, kilometer, cutoff time (entered as clock time,
 * as in the race rules) and life base.
 */
import { Plus, Trash2 } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import type { AidStation } from '../../domain/models'
import { clockAt, clockToElapsed } from '../../domain/race-time'

const props = defineProps<{ stations: AidStation[]; maxKm: number; startTime: string; saving?: boolean }>()
const emit = defineEmits<{ save: [stations: AidStation[]] }>()

interface Row {
  key: number
  name: string
  km: number
  major: boolean
  cutoffClock: string
  cutoffDay: number
}

let nextKey = 0
function toRows(stations: AidStation[]): Row[] {
  return stations.map((s) => {
    const cutoff = s.cutoffH !== undefined ? clockAt(props.startTime, s.cutoffH) : undefined
    return { key: nextKey++, name: s.name, km: s.km, major: s.major, cutoffClock: cutoff?.clock ?? '', cutoffDay: cutoff?.day ?? 0 }
  })
}

const rows = ref<Row[]>(toRows(props.stations))
watch(
  () => [props.stations, props.startTime] as const,
  () => (rows.value = toRows(props.stations)),
)

const error = ref('')

function add() {
  const last = rows.value.at(-1)?.km ?? 0
  rows.value.push({ key: nextKey++, name: '', km: Math.min(Math.round(last + 10), Math.floor(props.maxKm - 1)), major: false, cutoffClock: '', cutoffDay: 0 })
}

function remove(key: number) {
  rows.value = rows.value.filter((r) => r.key !== key)
}

function save() {
  error.value = ''
  const invalid = rows.value.find((r) => !r.name.trim() || !(r.km > 0 && r.km < props.maxKm))
  if (invalid) {
    error.value = `Vérifie « ${invalid.name || 'ravito sans nom'} » : nom obligatoire et kilomètre entre 0 et ${Math.floor(props.maxKm)}.`
    return
  }
  emit(
    'save',
    rows.value.map((r) => ({
      name: r.name.trim(),
      km: Number(r.km),
      major: r.major,
      cutoffH: r.cutoffClock ? clockToElapsed(props.startTime, r.cutoffClock, r.cutoffDay) : undefined,
    })),
  )
}
</script>

<template>
  <form class="editor" @submit.prevent="save">
    <p class="text-2 hint">
      Barrières horaires : saisis l’heure indiquée dans le règlement (et le jour). Elles sont converties en temps de course depuis le départ
      ({{ startTime }}).
    </p>
    <div v-if="rows.length === 0" class="muted empty">Aucun ravitaillement : ajoute ceux du règlement de course.</div>
    <div v-for="(row, i) in rows" :key="row.key" class="row">
      <span class="index num" aria-hidden="true">{{ i + 1 }}</span>
      <label class="field name">
        <span>Nom</span>
        <input v-model="row.name" class="input" maxlength="60" placeholder="Col de la Seigne" />
      </label>
      <label class="field km">
        <span>Km</span>
        <input v-model.number="row.km" class="input num" type="number" step="0.1" min="0" :max="maxKm" />
      </label>
      <div class="field cutoff">
        <span>Barrière</span>
        <div class="cutoff-inputs">
          <input v-model="row.cutoffClock" class="input num" type="time" :aria-label="`Barrière horaire de ${row.name || 'ce ravito'}`" />
          <select v-model.number="row.cutoffDay" class="select" :aria-label="`Jour de la barrière de ${row.name || 'ce ravito'}`">
            <option :value="0">J</option>
            <option :value="1">J+1</option>
            <option :value="2">J+2</option>
            <option :value="3">J+3</option>
          </select>
        </div>
      </div>
      <label class="major">
        <input v-model="row.major" type="checkbox" />
        Base de vie
      </label>
      <button type="button" class="btn btn-ghost btn-icon btn-danger" :aria-label="`Supprimer ${row.name || 'ce ravito'}`" @click="remove(row.key)">
        <Trash2 :size="18" />
      </button>
    </div>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <div class="actions">
      <button type="button" class="btn btn-sm" @click="add"><Plus :size="16" /> Ajouter un ravito</button>
      <button type="submit" class="btn btn-primary btn-sm" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer les ravitos' }}</button>
    </div>
  </form>
</template>

<style scoped>
.editor {
  display: grid;
  gap: var(--space-3);
}
.hint {
  font-size: 0.88rem;
}
.empty {
  padding: var(--space-3);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  text-align: center;
}
.row {
  display: grid;
  grid-template-columns: 28px minmax(0, 2fr) 90px minmax(0, 1.4fr) auto 42px;
  gap: var(--space-2) var(--space-3);
  align-items: end;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}
.index {
  align-self: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--teal-soft);
  color: var(--teal);
  font-size: 0.8rem;
  margin-top: 22px;
}
.cutoff-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px;
  gap: 6px;
}
.major {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  font-size: 0.88rem;
  color: var(--text-2);
  white-space: nowrap;
}
.major input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
}
@media (max-width: 760px) {
  .row {
    grid-template-columns: 28px minmax(0, 1fr) 84px;
  }
  .index {
    margin-top: 22px;
  }
  .cutoff {
    grid-column: 2 / 4;
  }
  .major {
    grid-column: 2 / 3;
  }
  .row > .btn {
    grid-column: 3 / 4;
    justify-self: end;
  }
}
</style>
