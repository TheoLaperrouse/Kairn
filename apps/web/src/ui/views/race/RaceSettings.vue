<script setup lang="ts">
import { Settings2 } from 'lucide-vue-next'
import { reactive, ref, watch } from 'vue'
import { useRaceCourseStore } from '../../../application/stores/race-course'
import type { AidStation, RaceCourse, RaceCourseSettings } from '../../../domain/models'
import AidStationEditor from '../../components/AidStationEditor.vue'
import { errorMessage } from '../../../domain/format'

const props = defineProps<{ course: RaceCourse }>()
const emit = defineEmits<{ error: [message: string] }>()

const store = useRaceCourseStore()
const savingSettings = ref(false)
const settingsSaved = ref(false)
const savingStations = ref(false)

// Copie locale éditée puis enregistrée.
const settings = reactive<RaceCourseSettings>({ ...props.course.settings })
watch(
  () => props.course.settings,
  (value) => Object.assign(settings, value),
)

async function saveSettings() {
  savingSettings.value = true
  settingsSaved.value = false
  emit('error', '')
  try {
    await store.update({ settings: { ...settings, weightKg: Number(settings.weightKg), temperatureC: Number(settings.temperatureC) } })
    settingsSaved.value = true
  } catch (e) {
    emit('error', errorMessage(e, 'Enregistrement impossible'))
  } finally {
    savingSettings.value = false
  }
}

async function saveStations(stations: AidStation[]) {
  savingStations.value = true
  emit('error', '')
  try {
    await store.update({ aidStations: stations })
  } catch (e) {
    emit('error', errorMessage(e, 'Enregistrement impossible'))
  } finally {
    savingStations.value = false
  }
}
</script>

<template>
  <details class="card settings no-print">
    <summary><Settings2 :size="18" aria-hidden="true" /> Réglages du jour J et ravitaillements</summary>
    <form class="settings-form" @submit.prevent="saveSettings">
      <label class="field">
        <span>Heure de départ</span>
        <input v-model="settings.startTime" class="input num" type="time" required />
      </label>
      <label class="field">
        <span>Température prévue (°C)</span>
        <input v-model.number="settings.temperatureC" class="input num" type="number" min="-30" max="50" />
      </label>
      <label class="field">
        <span>Transpiration</span>
        <select v-model="settings.sweat" class="select">
          <option value="FAIBLE">Faible</option>
          <option value="MOYEN">Moyenne</option>
          <option value="FORT">Forte</option>
        </select>
      </label>
      <label class="field">
        <span>Intestin entraîné</span>
        <select v-model="settings.gut" class="select">
          <option value="AUCUN">Pas encore (60 g/h)</option>
          <option value="PARTIEL">En partie (75 g/h)</option>
          <option value="ENTRAINE">Oui (90 g/h)</option>
        </select>
      </label>
      <label class="field">
        <span>Poids (kg)</span>
        <input v-model.number="settings.weightKg" class="input num" type="number" min="35" max="150" />
      </label>
      <div class="settings-actions">
        <button type="submit" class="btn btn-primary btn-sm" :disabled="savingSettings">
          {{ savingSettings ? 'Recalcul…' : 'Recalculer le plan' }}
        </button>
        <span v-if="settingsSaved" class="muted small" role="status">Plan recalculé.</span>
      </div>
    </form>
    <h3>Ravitaillements</h3>
    <AidStationEditor
      :stations="course.aidStations"
      :max-km="course.totalDistanceKm"
      :start-time="course.settings.startTime"
      :saving="savingStations"
      @save="saveStations"
    />
  </details>
</template>

<style scoped>
.small {
  font-size: 0.82rem;
}
.settings summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-weight: 650;
  font-size: 1.1rem;
  cursor: pointer;
  list-style: none;
}
.settings summary::-webkit-details-marker {
  display: none;
}
.settings[open] summary {
  margin-bottom: var(--space-4);
}
.settings h3 {
  margin: var(--space-5) 0 var(--space-3);
}
.settings-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: var(--space-3);
  align-items: end;
}
.settings-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
</style>
