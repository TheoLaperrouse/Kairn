<script setup lang="ts">
import {
  Bike,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Footprints,
  Info,
  Link2,
  LoaderCircle,
  RefreshCw,
  Unplug,
  XCircle,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useActivitiesStore } from '../../application/stores/activities'
import { useTrainingStore } from '../../application/stores/training'
import { errorMessage, formatDate, formatNumber, formatRelative, formatSeconds, SPORT_LABELS, VERDICT_LABELS, VERDICT_TONES } from '../../domain/format'
import { activityDay, type Sport } from '../../domain/models'
import VamProgressCard from '../components/VamProgressCard.vue'
import ActivityImportCard from './activities/ActivityImportCard.vue'

const store = useActivitiesStore()
const training = useTrainingStore()
const route = useRoute()
const router = useRouter()

const banner = ref<{ kind: 'ok' | 'error'; text: string }>()
const syncing = ref<string>()

const SPORT_ICONS: Record<Sport, typeof Footprints> = { RUN: Footprints, BIKE: Bike, STRENGTH: Dumbbell }

onMounted(async () => {
  await store.load()
  const integration = route.query.integration
  if (integration === 'error') banner.value = { kind: 'error', text: 'La connexion n’a pas abouti. Réessaie.' }
  else if (typeof integration === 'string') {
    banner.value = { kind: 'ok', text: `${providerLabel(integration)} est connecté. Première synchronisation en cours…` }
    void router.replace({ query: {} })
    await sync(integration)
  }
})

function providerLabel(name: string) {
  return name === 'strava' ? 'Strava' : name.charAt(0).toUpperCase() + name.slice(1)
}

const strava = computed(() => store.integrations.find((i) => i.provider === 'strava'))

function sessionTitle(id?: string) {
  return id ? training.sessionById(id)?.title : undefined
}

async function sync(provider: string) {
  syncing.value = provider
  try {
    const outcomes = await store.sync(provider)
    const imported = outcomes.filter((o) => o.status === 'IMPORTED').length
    banner.value = { kind: 'ok', text: imported ? `${imported} nouvelle(s) activité(s) importée(s) depuis ${providerLabel(provider)}.` : 'Tout est déjà à jour.' }
  } catch (e) {
    banner.value = { kind: 'error', text: errorMessage(e, 'Synchronisation impossible') }
  } finally {
    syncing.value = undefined
  }
}

const totals = computed(() => {
  const since = Date.now() - 28 * 86_400_000
  const recent = store.items.filter((a) => Date.parse(a.startTime) >= since)
  return {
    count: recent.length,
    hours: recent.reduce((s, a) => s + a.durationSec, 0) / 3600,
    km: recent.filter((a) => a.sport === 'RUN').reduce((s, a) => s + a.distanceKm, 0),
    elevation: recent.filter((a) => a.sport === 'RUN').reduce((s, a) => s + a.elevationGainM, 0),
  }
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Suivi</p>
        <h1>Activités</h1>
        <p class="lead">Importe tes sorties : chacune est rattachée automatiquement à la séance prévue le même jour.</p>
      </div>
    </header>

    <p v-if="banner" class="alert" :class="{ 'alert-error': banner.kind === 'error' }" role="status">
      <component :is="banner.kind === 'ok' ? CheckCircle2 : XCircle" :size="18" aria-hidden="true" />
      {{ banner.text }}
      <button type="button" class="btn btn-ghost btn-sm close" aria-label="Fermer le message" @click="banner = undefined">×</button>
    </p>

    <div class="grid grid-2 top">
      <ActivityImportCard @error="banner = { kind: 'error', text: $event }" />

      <section class="card" aria-labelledby="sync-title">
        <div class="card-title"><h2 id="sync-title">Synchronisation automatique</h2></div>

        <div class="provider">
          <div class="provider-head">
            <span class="logo-strava" aria-hidden="true">S</span>
            <div>
              <strong>Strava</strong>
              <p class="small muted">
                <template v-if="strava?.connected">
                  Connecté{{ strava.athleteName ? ` · ${strava.athleteName}` : '' }}
                  <template v-if="strava.lastSyncAt"> · synchro {{ formatRelative(strava.lastSyncAt) }}</template>
                </template>
                <template v-else-if="strava?.configured">Non connecté</template>
                <template v-else>Indisponible pour le moment</template>
              </p>
            </div>
          </div>
          <div v-if="strava?.configured" class="row">
            <template v-if="strava.connected">
              <button type="button" class="btn btn-sm btn-primary" :disabled="syncing === 'strava'" @click="sync('strava')">
                <LoaderCircle v-if="syncing === 'strava'" :size="16" class="spin" aria-hidden="true" />
                <RefreshCw v-else :size="16" aria-hidden="true" />
                Synchroniser maintenant
              </button>
              <button type="button" class="btn btn-sm btn-ghost" @click="store.disconnect('strava')"><Unplug :size="16" aria-hidden="true" /> Déconnecter</button>
            </template>
            <button v-else type="button" class="btn btn-sm btn-primary" @click="store.connect('strava')"><Link2 :size="16" aria-hidden="true" /> Connecter Strava</button>
          </div>
          <p v-if="strava?.connected" class="small text-2">
            Rien à faire : chaque sortie publiée sur Strava (y compris depuis Garmin Connect) arrive ici d’elle-même et coche la séance prévue.
          </p>
        </div>

        <aside class="garmin" aria-labelledby="garmin-title">
          <h3 id="garmin-title"><Info :size="16" aria-hidden="true" /> Montre Garmin ?</h3>
          <p class="small text-2">
            Dans l’app Garmin Connect, active le partage vers Strava puis connecte Strava ci-dessus : tes sorties arriveront ici toutes seules.
            Sinon, exporte le fichier original d’une activité depuis Garmin Connect et glisse-le dans la zone d’import.
          </p>
        </aside>
      </section>
    </div>

    <VamProgressCard />

    <section class="card" aria-labelledby="list-title">
      <div class="card-title">
        <h2 id="list-title">Historique</h2>
        <span class="muted small num">
          28 j : {{ totals.count }} sorties · {{ formatNumber(totals.hours, 1) }} h · {{ formatNumber(totals.km) }} km · {{ formatNumber(totals.elevation) }} m D+
        </span>
      </div>
      <p v-if="store.items.length === 0" class="empty muted">Aucune activité pour l’instant. Importe ta première sortie ci-dessus !</p>
      <ul v-else class="list">
        <li v-for="a in store.items" :key="a.id">
          <RouterLink :to="`/activites/${a.id}`" class="item">
            <span class="sport" :class="a.sport.toLowerCase()" :title="SPORT_LABELS[a.sport]">
              <component :is="SPORT_ICONS[a.sport]" :size="18" aria-hidden="true" />
              <span class="visually-hidden">{{ SPORT_LABELS[a.sport] }}</span>
            </span>
            <span class="main">
              <strong>{{ a.name }}</strong>
              <span class="small muted meta">
                {{ formatDate(activityDay(a)) }}
                <template v-if="sessionTitle(a.plannedSessionId) && sessionTitle(a.plannedSessionId) !== a.name">
                  · <span class="linked">✓ {{ sessionTitle(a.plannedSessionId) }}</span>
                </template>
                <span v-if="store.verdicts[a.id] && store.verdicts[a.id]!.verdict !== 'HORS_PLAN'" class="verdict" :class="VERDICT_TONES[store.verdicts[a.id]!.verdict]">
                  {{ VERDICT_LABELS[store.verdicts[a.id]!.verdict] }}
                </span>
              </span>
            </span>
            <span class="stats num">
              <span>{{ formatSeconds(a.durationSec) }}</span>
              <span v-if="a.distanceKm">{{ formatNumber(a.distanceKm, 1) }} km</span>
              <span v-if="a.elevationGainM">{{ formatNumber(a.elevationGainM) }} m D+</span>
              <span v-if="a.avgHeartRate" class="hide-sm">{{ a.avgHeartRate }} bpm</span>
            </span>
            <ChevronRight :size="18" class="chev" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.small {
  font-size: 0.84rem;
}
.top {
  align-items: start;
}
.alert {
  align-items: center;
}
.close {
  margin-left: auto;
  min-height: 28px;
  font-size: 1.1rem;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.provider {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
}
.provider-head {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}
.logo-strava {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-weight: 800;
  background: #fc5200;
  color: #fff;
  flex: none;
}
.garmin {
  margin-top: var(--space-4);
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius);
  border-left: 3px solid var(--teal);
  background: var(--teal-soft);
}
.garmin h3 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
}
.list li + li {
  border-top: 1px solid var(--border);
}
.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-2);
  text-decoration: none;
  border-radius: var(--radius-sm);
}
.item:hover {
  background: var(--surface-2);
}
.sport {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex: none;
  background: var(--accent-soft);
  color: var(--accent);
}
.sport.bike {
  background: var(--teal-soft);
  color: var(--teal);
}
.sport.strength {
  background: var(--surface-3);
  color: var(--text-2);
}
.main {
  display: grid;
  min-width: 0;
  flex: 1;
}
.main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.linked {
  color: var(--success);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
}
.verdict {
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-2);
}
.verdict.success {
  border-color: var(--success);
}
.verdict.warning {
  border-color: var(--warning);
}
.stats {
  display: flex;
  gap: var(--space-4);
  font-size: 0.88rem;
  color: var(--text-2);
  white-space: nowrap;
}
.chev {
  color: var(--muted);
  flex: none;
}
.empty {
  padding: var(--space-5) 0;
  text-align: center;
}
@media (max-width: 720px) {
  .item {
    flex-wrap: wrap;
  }
  .stats {
    width: 100%;
    padding-left: 50px;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .hide-sm,
  .chev {
    display: none;
  }
}
</style>
