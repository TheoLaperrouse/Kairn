<script setup lang="ts">
import { CheckCircle2, LoaderCircle, LogOut, MonitorSmartphone, RefreshCw, Smartphone } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../application/stores/auth'
import { useTrainingStore } from '../../application/stores/training'
import { errorMessage, formatLongDate, formatRelative } from '../../domain/format'
import type { AthleteProfile, RaceGoal } from '../../domain/models'
import CalendarFeedCard from '../components/CalendarFeedCard.vue'
import InstallAppCard from '../components/InstallAppCard.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import GoalForm from '../components/GoalForm.vue'
import NotificationSettingsCard from '../components/NotificationSettingsCard.vue'
import ProfileForm from '../components/ProfileForm.vue'

const auth = useAuthStore()
const training = useTrainingStore()
const router = useRouter()

const goal = ref<RaceGoal>()
const profile = ref<AthleteProfile>()
const saving = ref(false)
const saved = ref(false)
const error = ref('')
const revoking = ref<string>()

onMounted(async () => {
  await Promise.all([training.load(), auth.loadDevices()])
  if (training.goal) goal.value = { ...training.goal }
  if (training.profile) profile.value = { ...training.profile }
})

async function saveAndRegenerate() {
  if (!goal.value || !profile.value) return
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    await training.saveGoal(goal.value)
    await training.saveProfile(profile.value)
    await training.generatePlan()
    saved.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Enregistrement impossible')
  } finally {
    saving.value = false
  }
}

async function revoke() {
  if (!revoking.value) return
  const id = revoking.value
  const wasCurrent = auth.devices.find((d) => d.id === id)?.current
  revoking.value = undefined
  await auth.revokeDevice(id)
  if (wasCurrent) {
    training.reset()
    await router.replace('/connexion')
  }
}

async function logout() {
  await auth.logout()
  training.reset()
  await router.replace('/connexion')
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Réglages</p>
        <h1>Ton objectif, ton profil, tes rappels</h1>
        <p class="lead">Modifie ta course ou tes disponibilités : le plan est recalculé à partir d’aujourd’hui.</p>
      </div>
    </header>

    <section v-if="goal" class="card" aria-labelledby="goal-title">
      <div class="card-title"><h2 id="goal-title">Objectif</h2></div>
      <GoalForm v-model="goal" />
    </section>

    <section v-if="profile" class="card" aria-labelledby="profile-title">
      <div class="card-title"><h2 id="profile-title">Profil</h2></div>
      <ProfileForm v-model="profile" />
    </section>

    <div v-if="goal && profile" class="save-bar card">
      <div>
        <strong>Enregistrer et régénérer le plan</strong>
        <p class="small text-2">Les séances passées et les activités importées sont conservées dans l’historique ; seules les semaines à venir sont recalculées.</p>
      </div>
      <div class="row">
        <span v-if="saved" class="ok" role="status"><CheckCircle2 :size="18" aria-hidden="true" /> Plan mis à jour</span>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="saveAndRegenerate">
          <LoaderCircle v-if="saving" :size="18" class="spin" aria-hidden="true" />
          <RefreshCw v-else :size="18" aria-hidden="true" />
          Enregistrer et régénérer
        </button>
      </div>
      <p v-if="error" class="alert alert-error full" role="alert">{{ error }}</p>
    </div>

    <div class="grid grid-2">
      <NotificationSettingsCard />
      <CalendarFeedCard />
    </div>

    <InstallAppCard />

    <section class="card" aria-labelledby="devices-title">
      <div class="card-title">
        <h2 id="devices-title">Appareils connectés</h2>
        <span class="chip">{{ auth.devices.length }} session{{ auth.devices.length > 1 ? 's' : '' }}</span>
      </div>
      <ul class="devices">
        <li v-for="d in auth.devices" :key="d.id" :class="{ current: d.current }">
          <span class="dev-ic" aria-hidden="true">
            <component :is="/iOS|Android/.test(d.deviceLabel) ? Smartphone : MonitorSmartphone" :size="20" />
          </span>
          <div class="dev-main">
            <strong>{{ d.deviceLabel }} <span v-if="d.current" class="chip chip-teal">cet appareil</span></strong>
            <span class="small muted">Actif {{ formatRelative(d.lastSeenAt) }} · connecté depuis le {{ formatLongDate(d.createdAt) }}</span>
          </div>
          <button type="button" class="btn btn-sm btn-ghost btn-danger" @click="revoking = d.id">{{ d.current ? 'Déconnecter' : 'Révoquer' }}</button>
        </li>
      </ul>
    </section>

    <section class="card logout-card">
      <div>
        <strong>{{ auth.user?.displayName }}</strong>
        <p class="small muted">{{ auth.user?.email }}</p>
      </div>
      <button type="button" class="btn" @click="logout"><LogOut :size="18" aria-hidden="true" /> Se déconnecter</button>
    </section>

    <ConfirmDialog
      :open="Boolean(revoking)"
      :title="auth.devices.find((d) => d.id === revoking)?.current ? 'Te déconnecter de cet appareil ?' : 'Révoquer cette session ?'"
      message="L’appareil devra se reconnecter avec ton e-mail et ton mot de passe."
      confirm-label="Révoquer"
      danger
      @confirm="revoke"
      @cancel="revoking = undefined"
    />
  </div>
</template>

<style scoped>
.small {
  font-size: 0.85rem;
}
.save-bar {
  position: sticky;
  bottom: var(--space-4);
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: center;
  justify-content: space-between;
  border-color: var(--accent);
}
.save-bar > div:first-child {
  flex: 1 1 280px;
}
.full {
  width: 100%;
}
.ok {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--success);
  font-weight: 600;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.devices {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-2);
}
.devices li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
}
.devices li.current {
  border-color: var(--teal);
}
.dev-ic {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--surface-3);
  color: var(--text-2);
  flex: none;
}
.dev-main {
  display: grid;
  flex: 1;
  min-width: 0;
}
.dev-main strong {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.logout-card {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: space-between;
  align-items: center;
}
@media (max-width: 900px) {
  .save-bar {
    bottom: 84px;
  }
}
@media (max-width: 520px) {
  .devices li {
    flex-wrap: wrap;
  }
  .devices li .btn {
    margin-left: 52px;
  }
}
</style>
