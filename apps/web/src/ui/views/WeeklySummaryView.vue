<script setup lang="ts">
/** Bilan d'une semaine : volume face au plan, séances clés, intensité, forme, et ce qui vient ensuite. */
import { ArrowRight, CalendarRange, ChevronLeft, ChevronRight, CircleCheck, CircleDashed, CircleX, Star, Trophy } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../../application/api-provider'
import {
  SPORT_LABELS,
  VERDICT_LABELS,
  VERDICT_TONES,
  addDaysIso,
  formatDate,
  formatDuration,
  formatNumber,
  formatSeconds,
  formatShortDate,
  formatWeekRange,
  startOfWeekIso,
  todayIso,
} from '../../domain/format'
import type { WeeklySummary } from '../../domain/models'
import InsightList from '../components/InsightList.vue'
import ZoneBar from '../components/ZoneBar.vue'

const props = defineProps<{ week?: string }>()
const api = useApi()
const router = useRouter()

const summary = ref<WeeklySummary | null>()
const error = ref('')
const loading = ref(false)

watch(
  () => props.week,
  async (week) => {
    loading.value = true
    error.value = ''
    try {
      summary.value = await api.weeklySummary(week)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Bilan indisponible'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const currentWeek = startOfWeekIso(todayIso())
const canGoNext = computed(() => Boolean(summary.value && summary.value.weekStart < currentWeek))
function go(offset: number) {
  if (summary.value) void router.push(`/bilan/${addDaysIso(summary.value.weekStart, offset * 7)}`)
}

const volume = computed(() => {
  const s = summary.value
  if (!s) return []
  return [
    { label: 'Temps', value: formatDuration(s.totals.hours * 60), target: s.targets ? formatDuration(s.targets.hours * 60) : undefined, ratio: s.targets?.hours ? s.totals.hours / s.targets.hours : undefined },
    { label: 'Distance (course)', value: `${formatNumber(s.totals.km, 1)} km`, target: s.targets ? `${formatNumber(s.targets.km)} km` : undefined, ratio: s.targets?.km ? s.totals.km / s.targets.km : undefined },
    { label: 'Dénivelé +', value: `${formatNumber(s.totals.elevationM)} m`, target: s.targets ? `${formatNumber(s.targets.elevationM)} m` : undefined, ratio: s.targets?.elevationM ? s.totals.elevationM / s.targets.elevationM : undefined },
  ]
})

const STATUS_ICONS = { DONE: CircleCheck, SKIPPED: CircleX, PLANNED: CircleDashed } as const
const STATUS_LABELS = { DONE: 'faite', SKIPPED: 'non réalisée', PLANNED: 'pas encore faite' } as const
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <p class="eyebrow">
          Bilan<template v-if="summary?.week"> · Semaine {{ summary.week.index + 1 }} · {{ summary.week.phaseLabel }}{{ summary.week.isRecovery ? ' (allégée)' : '' }}</template>
        </p>
        <h1>{{ summary ? `Semaine du ${formatWeekRange(summary.weekStart)}` : 'Bilan de la semaine' }}</h1>
        <p v-if="summary" class="lead">
          {{ summary.headline }}
          <span v-if="summary.inProgress" class="chip">en cours</span>
        </p>
      </div>
      <nav class="row week-nav" aria-label="Changer de semaine">
        <button type="button" class="btn btn-sm btn-ghost" :disabled="!summary" @click="go(-1)"><ChevronLeft :size="16" aria-hidden="true" /> Précédente</button>
        <button type="button" class="btn btn-sm btn-ghost" :disabled="!canGoNext" @click="go(1)">Suivante <ChevronRight :size="16" aria-hidden="true" /></button>
      </nav>
    </header>

    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !summary" class="muted">Chargement…</p>
    <p v-else-if="summary === null" class="card muted">Renseigne ton profil pour obtenir des bilans.</p>

    <template v-else-if="summary">
      <div class="grid tiles">
        <div v-for="v in volume" :key="v.label" class="card tile">
          <span class="eyebrow">{{ v.label }}</span>
          <strong class="value">{{ v.value }}</strong>
          <template v-if="v.ratio !== undefined">
            <span class="meter" :aria-label="`${Math.round(v.ratio * 100)} % de l’objectif`">
              <span class="fill" :class="{ over: v.ratio > 1.15, under: v.ratio < 0.75 }" :style="{ width: `${Math.min(v.ratio, 1) * 100}%` }" />
            </span>
            <small class="muted num">{{ Math.round(v.ratio * 100) }} % de {{ v.target }}</small>
          </template>
        </div>
        <div v-if="summary.sessions.planned" class="card tile">
          <span class="eyebrow">Séances</span>
          <strong class="value">{{ summary.sessions.done }}<span class="muted"> / {{ summary.sessions.planned }}</span></strong>
          <small class="muted">
            <template v-if="summary.sessions.missed">{{ summary.sessions.missed }} manquée{{ summary.sessions.missed > 1 ? 's' : '' }}</template>
            <template v-if="summary.sessions.missed && summary.sessions.skipped"> · </template>
            <template v-if="summary.sessions.skipped">{{ summary.sessions.skipped }} non réalisée{{ summary.sessions.skipped > 1 ? 's' : '' }}</template>
            <template v-if="!summary.sessions.missed && !summary.sessions.skipped">aucune manquée</template>
          </small>
        </div>
        <div v-else class="card tile">
          <span class="eyebrow">Sorties</span>
          <strong class="value">{{ summary.totals.activities }}</strong>
          <small class="muted">semaine hors du plan</small>
        </div>
      </div>

      <div class="grid grid-2 top-grid">
        <section class="card" aria-labelledby="insights-title">
          <div class="card-title"><h2 id="insights-title">Ce qu’il faut retenir</h2></div>
          <InsightList v-if="summary.insights.length" :insights="summary.insights" />
          <p v-else class="muted">Pas encore assez de données pour tirer des enseignements de cette semaine.</p>
        </section>

        <div class="stack">
          <section class="card" aria-labelledby="form-title">
            <div class="card-title"><h2 id="form-title">Forme</h2></div>
            <p v-if="!summary.form.reliable" class="small muted">Encore moins de 4 semaines d’historique : ces valeurs s’affineront avec tes prochaines sorties.</p>
            <dl class="facts">
              <div>
                <dt>Forme de fond</dt>
                <dd>
                  <strong class="num">{{ summary.form.fitness }}</strong>
                  <small class="muted num sub">{{ summary.form.fitnessChange >= 0 ? '+' : '' }}{{ formatNumber(summary.form.fitnessChange, 1) }} sur la semaine</small>
                </dd>
              </div>
              <div>
                <dt>Fraîcheur</dt>
                <dd>
                  <strong class="num">{{ summary.form.freshness > 0 ? '+' : '' }}{{ summary.form.freshness }}</strong>
                  <small v-if="summary.form.reliable" class="muted sub">{{ summary.form.freshness <= -25 ? 'fatigue élevée' : summary.form.freshness < -10 ? 'en charge' : 'frais' }}</small>
                </dd>
              </div>
              <div v-if="summary.readiness">
                <dt>Bilan du matin</dt>
                <dd>
                  <strong class="num">{{ summary.readiness.average }}</strong><span class="muted">/100</span>
                  <small class="muted sub">en moyenne sur {{ summary.readiness.days }} jour{{ summary.readiness.days > 1 ? 's' : '' }}</small>
                </dd>
              </div>
              <div>
                <dt>Charge de la semaine</dt>
                <dd><strong class="num">{{ summary.totals.load }}</strong></dd>
              </div>
            </dl>
          </section>

          <section v-if="summary.zones" class="card" aria-labelledby="week-zones-title">
            <div class="card-title"><h2 id="week-zones-title">Intensité</h2><span class="small muted">course et vélo</span></div>
            <ZoneBar :seconds="summary.zones" />
          </section>
        </div>
      </div>

      <section v-if="summary.keySessions.length" class="card" aria-labelledby="keys-title">
        <div class="card-title"><h2 id="keys-title">Séances clés</h2></div>
        <ul class="list">
          <li v-for="k in summary.keySessions" :key="k.id">
            <component :is="STATUS_ICONS[k.status]" :size="18" :class="`status-${k.status.toLowerCase()}`" aria-hidden="true" />
            <RouterLink :to="`/seance/${k.id}`">{{ k.title }}</RouterLink>
            <span class="muted small">{{ formatDate(k.date) }} · {{ STATUS_LABELS[k.status] }}</span>
            <span v-if="k.verdict" class="chip" :class="`verdict-${VERDICT_TONES[k.verdict]}`">{{ VERDICT_LABELS[k.verdict] }}</span>
          </li>
        </ul>
      </section>

      <div v-if="summary.highlights.length" class="grid grid-3">
        <RouterLink v-for="h in summary.highlights" :key="h.label" :to="h.activityId ? `/activites/${h.activityId}` : '#'" class="card highlight">
          <Trophy :size="18" aria-hidden="true" />
          <span class="eyebrow">{{ h.label }}</span>
          <strong class="value">{{ h.value }}</strong>
          <small v-if="h.detail" class="muted">{{ h.detail }}</small>
        </RouterLink>
      </div>

      <section class="card" aria-labelledby="week-activities-title">
        <div class="card-title"><h2 id="week-activities-title">Sorties de la semaine</h2></div>
        <p v-if="summary.activities.length === 0" class="muted">Aucune activité enregistrée cette semaine.</p>
        <ul v-else class="list activities">
          <li v-for="a in summary.activities" :key="a.id">
            <RouterLink :to="`/activites/${a.id}`" class="activity">
              <span class="when muted small">{{ formatShortDate(a.startTime) }}</span>
              <span class="what">
                <strong>{{ a.name }}</strong>
                <small class="muted">{{ SPORT_LABELS[a.sport] }} · {{ formatSeconds(a.durationSec) }}<template v-if="a.distanceKm"> · {{ formatNumber(a.distanceKm, 1) }} km</template><template v-if="a.elevationGainM"> · {{ formatNumber(a.elevationGainM) }} m D+</template></small>
              </span>
              <span class="chip" :class="`verdict-${VERDICT_TONES[a.verdict]}`">{{ VERDICT_LABELS[a.verdict] }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="summary.nextWeek" class="card next-week" aria-labelledby="next-week-title">
        <CalendarRange :size="22" aria-hidden="true" />
        <div>
          <h2 id="next-week-title">Semaine prochaine · {{ summary.nextWeek.phaseLabel }}{{ summary.nextWeek.isRecovery ? ' (allégée)' : '' }}</h2>
          <p class="text-2">{{ summary.nextWeek.focus }}</p>
          <p class="num">
            {{ formatDuration(summary.nextWeek.targets.hours * 60) }} · {{ formatNumber(summary.nextWeek.targets.km) }} km · {{ formatNumber(summary.nextWeek.targets.elevationM) }} m D+
          </p>
          <ul v-if="summary.nextWeek.keySessions.length" class="next-keys">
            <li v-for="k in summary.nextWeek.keySessions" :key="k.id">
              <Star :size="14" aria-hidden="true" />
              <RouterLink :to="`/seance/${k.id}`">{{ k.title }}</RouterLink>
              <span class="muted small">{{ formatDate(k.date) }}</span>
            </li>
          </ul>
          <RouterLink to="/plan" class="btn btn-sm btn-ghost">Voir le plan <ArrowRight :size="16" aria-hidden="true" /></RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.week-nav {
  align-self: end;
}
.lead .chip {
  margin-left: 6px;
  vertical-align: middle;
}
.tiles {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
}
.tile {
  display: grid;
  gap: 6px;
  align-content: start;
}
.value {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 600;
}
.meter {
  position: relative;
  height: 6px;
  border-radius: 3px;
  background: var(--surface-3);
  overflow: hidden;
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 3px;
  background: var(--teal);
}
.fill.under,
.fill.over {
  background: var(--warning);
}
.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.facts dt {
  font-size: 0.78rem;
  color: var(--muted);
}
.facts dd {
  margin: 2px 0 0;
}
.facts .sub {
  display: block;
}
.top-grid {
  align-items: start;
}
.facts strong {
  font-size: 1.3rem;
  font-weight: 600;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.list > li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
}
.list > li:last-child {
  border-bottom: 0;
}
.list a {
  font-weight: 600;
}
.status-done {
  color: var(--success);
}
.status-skipped {
  color: var(--danger);
}
.status-planned {
  color: var(--muted);
}
.activities > li {
  padding: 0;
}
.activity {
  display: grid;
  grid-template-columns: 4.5em 1fr auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) 0;
  color: inherit;
  text-decoration: none;
}
.activity .what {
  display: grid;
  min-width: 0;
}
.activity:hover strong {
  color: var(--accent);
}
.verdict-success {
  border-color: var(--success);
}
.verdict-warning {
  border-color: var(--warning);
}
.highlight {
  display: grid;
  gap: 4px;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s var(--ease);
}
.highlight:hover {
  border-color: var(--accent);
}
.highlight > svg {
  color: var(--warning);
}
.next-week {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}
.next-week > svg {
  color: var(--teal);
  flex: none;
}
.next-week h2 {
  margin-bottom: 4px;
}
.next-keys {
  list-style: none;
  margin: var(--space-3) 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.next-keys li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.next-keys svg {
  color: var(--accent);
}
.next-keys a {
  font-weight: 600;
}
@media (max-width: 560px) {
  .activity {
    grid-template-columns: 1fr auto;
  }
  .activity .when {
    display: none;
  }
}
</style>
