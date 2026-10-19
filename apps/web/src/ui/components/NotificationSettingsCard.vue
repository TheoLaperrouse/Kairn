<script setup lang="ts">
import { Bell, BellOff, BellRing, CalendarCheck, LoaderCircle, Send, Share, Smartphone, Sparkles, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useNotificationsStore } from '../../application/stores/notifications'
import { formatRelative } from '../../domain/format'
import type { NotificationSettings } from '../../domain/models'

const store = useNotificationsStore()
const busy = ref(false)
const message = ref<{ kind: 'ok' | 'error'; text: string }>()

onMounted(() => store.load().catch(() => undefined))

const settings = computed(() => store.status?.settings)

async function run(action: () => Promise<unknown>, success?: string) {
  busy.value = true
  message.value = undefined
  try {
    await action()
    if (success) message.value = { kind: 'ok', text: success }
  } catch (e) {
    message.value = { kind: 'error', text: e instanceof Error ? e.message : 'Action impossible' }
  } finally {
    busy.value = false
  }
}

function update(change: (s: NotificationSettings) => NotificationSettings) {
  if (!settings.value) return
  // Copie simple : les objets réactifs (proxys) ne passent pas par structuredClone.
  void run(() => store.save(change(JSON.parse(JSON.stringify(settings.value)) as NotificationSettings)))
}

const enable = () => run(() => store.enable(), 'Notifications activées sur cet appareil.')
const disable = () => run(() => store.disable(), 'Cet appareil ne recevra plus de notifications.')
const test = () => run(async () => {
  const sent = await store.test()
  message.value = { kind: 'ok', text: `Notification de test envoyée à ${sent} appareil${sent > 1 ? 's' : ''}.` }
})
</script>

<template>
  <section class="card" aria-labelledby="notif-title">
    <div class="card-title">
      <h2 id="notif-title"><Bell :size="20" aria-hidden="true" /> Notifications</h2>
    </div>

    <div class="device">
      <template v-if="store.support === 'NEEDS_INSTALL'">
        <Share :size="20" aria-hidden="true" />
        <p class="small">
          <strong>Sur iPhone, ajoute d’abord Kairn à l’écran d’accueil</strong> : touche <em>Partager</em> puis <em>Sur l’écran d’accueil</em>,
          ouvre Kairn depuis l’icône et reviens ici. Apple n’autorise les notifications que pour les applications installées (iOS 16.4 ou plus).
        </p>
      </template>
      <template v-else-if="store.support === 'INSECURE'">
        <BellOff :size="20" aria-hidden="true" />
        <p class="small">Les notifications ne fonctionnent qu’en HTTPS : ouvre Kairn depuis son adresse sécurisée.</p>
      </template>
      <template v-else-if="store.support === 'UNSUPPORTED'">
        <BellOff :size="20" aria-hidden="true" />
        <p class="small">Ce navigateur ne gère pas les notifications web. Essaie Chrome, Firefox, Edge ou Safari à jour.</p>
      </template>
      <template v-else-if="store.support === 'DENIED'">
        <BellOff :size="20" aria-hidden="true" />
        <p class="small">Les notifications sont bloquées pour Kairn : autorise-les dans les réglages du site (icône à gauche de l’adresse), puis recharge la page.</p>
      </template>
      <template v-else-if="store.enabledHere">
        <BellRing :size="20" class="on" aria-hidden="true" />
        <p class="small"><strong>Activées sur cet appareil.</strong></p>
        <div class="row">
          <button type="button" class="btn btn-sm" :disabled="busy" @click="test"><Send :size="16" aria-hidden="true" /> Tester</button>
          <button type="button" class="btn btn-sm btn-ghost" :disabled="busy" @click="disable">Désactiver</button>
        </div>
      </template>
      <template v-else>
        <Bell :size="20" aria-hidden="true" />
        <p class="small">Reçois ta séance du jour le matin, l’analyse de tes sorties et ton bilan du dimanche.</p>
        <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="enable">
          <LoaderCircle v-if="busy" :size="16" class="spin" aria-hidden="true" />
          <BellRing v-else :size="16" aria-hidden="true" />
          Activer sur cet appareil
        </button>
      </template>
    </div>

    <p v-if="message" class="alert" :class="{ 'alert-error': message.kind === 'error' }" role="status">{{ message.text }}</p>

    <!-- Préférences, communes à tous les appareils du compte -->
    <div v-if="settings" class="prefs" :class="{ dimmed: !store.status?.devices.length }">
      <div class="pref">
        <label class="switch">
          <span><Smartphone :size="18" aria-hidden="true" /> Séance du jour, le matin</span>
          <input type="checkbox" :checked="settings.morning.enabled" @change="update((s) => ({ ...s, morning: { ...s.morning, enabled: ($event.target as HTMLInputElement).checked } }))" />
        </label>
        <label v-if="settings.morning.enabled" class="time">
          <span class="small text-2">à</span>
          <input
            type="time"
            class="input"
            :value="settings.morning.time"
            aria-label="Heure du rappel du matin"
            @change="update((s) => ({ ...s, morning: { ...s.morning, time: ($event.target as HTMLInputElement).value } }))"
          />
        </label>
        <p class="small muted">Uniquement les jours où une séance est prévue.</p>
      </div>

      <div class="pref">
        <label class="switch">
          <span><Sparkles :size="18" aria-hidden="true" /> Analyse après chaque sortie</span>
          <input type="checkbox" :checked="settings.analysis.enabled" @change="update((s) => ({ ...s, analysis: { enabled: ($event.target as HTMLInputElement).checked } }))" />
        </label>
        <p class="small muted">Dès que la sortie arrive de Strava ou de la montre.</p>
      </div>

      <div class="pref">
        <label class="switch">
          <span><CalendarCheck :size="18" aria-hidden="true" /> Bilan de la semaine, le dimanche</span>
          <input type="checkbox" :checked="settings.weekly.enabled" @change="update((s) => ({ ...s, weekly: { ...s.weekly, enabled: ($event.target as HTMLInputElement).checked } }))" />
        </label>
        <label v-if="settings.weekly.enabled" class="time">
          <span class="small text-2">à</span>
          <input
            type="time"
            class="input"
            :value="settings.weekly.time"
            aria-label="Heure du bilan du dimanche"
            @change="update((s) => ({ ...s, weekly: { ...s.weekly, time: ($event.target as HTMLInputElement).value } }))"
          />
        </label>
      </div>
      <p class="small muted">Heures de ton fuseau : {{ settings.timeZone }}.</p>
    </div>

    <ul v-if="store.status?.devices.length" class="devices" aria-label="Appareils notifiés">
      <li v-for="d in store.status.devices" :key="d.endpoint">
        <Smartphone :size="16" aria-hidden="true" />
        <span>{{ d.deviceLabel }} <span v-if="d.endpoint === store.deviceEndpoint" class="chip chip-teal">cet appareil</span></span>
        <span class="small muted">depuis {{ formatRelative(d.createdAt) }}</span>
        <button type="button" class="btn btn-sm btn-ghost btn-icon" :aria-label="`Ne plus notifier ${d.deviceLabel}`" :disabled="busy" @click="run(() => store.removeDevice(d.endpoint))">
          <Trash2 :size="16" />
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.card-title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.device {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-3);
  align-items: center;
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--surface-2);
}
.device > svg {
  color: var(--muted);
}
.device > svg.on {
  color: var(--success);
}
.device p {
  margin: 0;
}
.device > .btn,
.device > .row {
  grid-column: 2;
  justify-self: start;
}
.prefs {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-4);
}
.prefs.dimmed {
  opacity: 0.7;
}
.pref {
  display: grid;
  gap: var(--space-2);
}
.pref .switch span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.pref p {
  margin: 0;
}
.time {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-left: var(--space-4);
}
.time .input {
  width: auto;
  min-height: 38px;
  padding: 6px 10px;
}
.devices {
  list-style: none;
  margin: var(--space-4) 0 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.devices li {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
}
</style>
