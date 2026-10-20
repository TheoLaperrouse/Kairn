<script setup lang="ts">
/** Envoi d'une séance structurée sur la montre : fichier .FIT ou dépôt direct dans GARMIN/NewFiles. */
import { CircleCheck, Download, Send, TriangleAlert, Watch } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useApi } from '../../application/api-provider'
import { errorMessage } from '../../domain/format'
import type { PlannedSession } from '../../domain/models'

const props = defineProps<{ session: PlannedSession }>()

const api = useApi()
const configured = ref(false)
const sending = ref(false)
const sent = ref(false)
const error = ref<string>()

onMounted(async () => {
  configured.value = await api.watchStatus().then((s) => s.configured, () => false)
})

async function send() {
  sending.value = true
  error.value = undefined
  try {
    await api.sendSessionToWatch(props.session.id)
    sent.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Envoi impossible')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="card watch" aria-labelledby="watch-title">
    <div class="card-title">
      <h2 id="watch-title"><Watch :size="18" aria-hidden="true" /> Sur ma montre</h2>
    </div>
    <p class="text-2">
      La séance est découpée en étapes avec ses zones cardiaques : ta montre te guide (bips, répétitions, récupérations).
    </p>
    <div class="row">
      <a class="btn btn-primary" :href="api.workoutFileUrl(session.id)" download>
        <Download :size="18" aria-hidden="true" /> Télécharger pour ma montre (.FIT)
      </a>
      <button v-if="configured" type="button" class="btn" :disabled="sending || sent" @click="send">
        <component :is="sent ? CircleCheck : Send" :size="18" aria-hidden="true" />
        {{ sent ? 'Envoyée sur la montre' : sending ? 'Envoi…' : 'Envoyer sur la montre' }}
      </button>
    </div>
    <p v-if="error" class="alert alert-error" role="alert"><TriangleAlert :size="18" aria-hidden="true" /> {{ error }}</p>
    <details class="help">
      <summary>Comment l’installer sur ma Garmin ?</summary>
      <ol>
        <li>Branche ta Garmin en USB : elle apparaît comme une clé.</li>
        <li>Copie le fichier .FIT dans le dossier <code>GARMIN/NewFiles</code>.</li>
        <li>Débranche : la séance apparaît dans <strong>Entraînements</strong>, avec les zones cardiaques de ta montre.</li>
      </ol>
    </details>
  </section>
</template>

<style scoped>
.watch h2 {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.watch {
  display: grid;
  gap: var(--space-3);
}
.watch .card-title {
  margin-bottom: 0;
}
.help {
  border-top: 1px solid var(--border);
  padding-top: var(--space-3);
  font-size: 0.9rem;
}
.help summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-2);
}
.help ol {
  margin: var(--space-2) 0;
  padding-left: 1.2em;
  display: grid;
  gap: 4px;
}
code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 6px;
}
</style>
