<script setup lang="ts">
import { ArrowRight, Clock, Flag, History, Mountain, Play, Route, Sparkles, Star, TriangleAlert, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../../application/stores/auth'
import { useTrainingStore } from '../../application/stores/training'
import {
  DAYS_SHORT,
  PHASE_LABELS,
  formatDate,
  formatDuration,
  formatLongDate,
  formatNumber,
  todayIso,
  weekdayOf,
} from '../../domain/format'
import type { PlanAdjustment, PlannedSession } from '../../domain/models'
import AdjustmentLog from '../components/AdjustmentLog.vue'
import MorningCheckIn from '../components/MorningCheckIn.vue'
import LoadChart from '../components/LoadChart.vue'
import SessionCard from '../components/SessionCard.vue'
import StatTile from '../components/StatTile.vue'
import VolumeChart from '../components/VolumeChart.vue'
import WeeklySummaryTeaser from '../components/WeeklySummaryTeaser.vue'
import { PHASE_COLORS } from '../components/phase-colors'

const training = useTrainingStore()
const auth = useAuthStore()
const loading = ref(!training.dashboard)
const error = ref<string>()

const ADAPT_KEY = 'kairn-last-adapt'
const adaptation = ref<PlanAdjustment>()

/** Rattrapage des séances manquées : une fois par jour, au premier passage sur le tableau de bord. */
async function adaptOncePerDay() {
  let last: string | null = null
  try {
    last = localStorage.getItem(ADAPT_KEY)
  } catch {
    /* stockage indisponible : on adapte quand même, l'appel est idempotent */
  }
  if (last === todayIso()) return
  const adjustment = await training.adaptPlan()
  if (adjustment) adaptation.value = adjustment
  try {
    localStorage.setItem(ADAPT_KEY, todayIso())
  } catch {
    /* ignoré */
  }
}

onMounted(async () => {
  try {
    await adaptOncePerDay().catch(() => undefined)
    await training.loadDashboard()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Impossible de charger le tableau de bord'
  } finally {
    loading.value = false
  }
})

const d = computed(() => training.dashboard)
const today = todayIso()

const greeting = computed(() => {
  const hour = new Date().getHours()
  const name = training.profile?.name ?? auth.user?.displayName ?? ''
  return `${hour < 6 || hour >= 18 ? 'Bonsoir' : 'Bonjour'} ${name}`.trim()
})

const todaySessions = computed(() => d.value?.weekSessions.filter((s) => s.date === today) ?? [])

const weekDays = computed(() => {
  if (!d.value) return []
  const byDay: PlannedSession[][] = Array.from({ length: 7 }, () => [])
  for (const s of d.value.weekSessions) byDay[weekdayOf(s.date)]!.push(s)
  return byDay.map((sessions, i) => ({ label: DAYS_SHORT[i]!, sessions, isToday: weekdayOf(today) === i }))
})

const weekProgress = computed(() => {
  const sessions = d.value?.weekSessions.filter((s) => s.type !== 'COURSE') ?? []
  const done = sessions.filter((s) => s.status === 'DONE')
  const plannedMin = sessions.reduce((sum, s) => sum + s.durationMin, 0)
  const doneMin = done.reduce((sum, s) => sum + s.durationMin, 0)
  return { plannedMin, doneMin, ratio: plannedMin ? doneMin / plannedMin : 0, done: done.length, total: sessions.length }
})

const adherence = computed(() => {
  const a = d.value?.adherence
  if (!a || a.total === 0) return undefined
  return Math.round((a.done / a.total) * 100)
})

const readiness = computed(() => {
  const form = d.value?.raceDayForm
  if (form === undefined) return undefined
  if (form < -10) return { label: 'Trop fatigué', tone: 'danger' as const }
  if (form < 5) return { label: 'Encore chargé', tone: 'warning' as const }
  if (form <= 35) return { label: 'Frais et prêt', tone: 'success' as const }
  return { label: 'Risque de désentraînement', tone: 'warning' as const }
})

const countdown = computed(() => {
  const days = d.value?.goal.daysToRace ?? 0
  return { weeks: Math.floor(days / 7), days: days % 7 }
})
</script>

<template>
  <div class="page">
    <!-- Chargement -->
    <template v-if="loading">
      <div class="skeleton hero-skel" />
      <div class="grid grid-4"><div v-for="i in 4" :key="i" class="skeleton tile-skel" /></div>
      <div class="skeleton chart-skel" />
    </template>

    <div v-else-if="error" class="alert alert-error" role="alert"><TriangleAlert :size="18" /> {{ error }}</div>

    <div v-else-if="!d" class="card empty">
      <Mountain :size="36" class="muted" />
      <h2>Pas encore de plan</h2>
      <p class="text-2">Choisis ton objectif pour générer ton plan d’entraînement.</p>
      <RouterLink to="/bienvenue" class="btn btn-primary">Commencer <ArrowRight :size="18" /></RouterLink>
    </div>

    <template v-else>
      <!-- Bandeau objectif -->
      <section class="hero topo" aria-labelledby="hero-title">
        <div class="hero-main">
          <p class="eyebrow">{{ greeting }} · objectif</p>
          <h1 id="hero-title">{{ d.goal.name }}</h1>
          <p class="hero-date">{{ formatLongDate(d.goal.raceDate) }}</p>
          <div class="hero-facts">
            <span class="fact"><Route :size="16" aria-hidden="true" /><span class="num">{{ formatNumber(d.goal.distanceKm) }}</span> km</span>
            <span class="fact"><Mountain :size="16" aria-hidden="true" /><span class="num">{{ formatNumber(d.goal.elevationGainM) }}</span> m D+</span>
            <span class="fact"><Clock :size="16" aria-hidden="true" />≈ <span class="num">{{ formatNumber(d.goal.estimatedDurationH, 1) }}</span> h</span>
            <span class="chip chip-accent">{{ d.goal.category }} · {{ d.goal.categoryLabel }}</span>
            <span class="chip">{{ d.goal.kmEffort }} km-effort</span>
          </div>
        </div>
        <div class="countdown" :aria-label="`Course dans ${d.goal.daysToRace} jours`">
          <template v-if="d.goal.daysToRace > 0">
            <span class="cd-label">J −</span>
            <span class="cd-value num">{{ d.goal.daysToRace }}</span>
            <span class="cd-sub">{{ countdown.weeks }} sem. {{ countdown.days }} j</span>
          </template>
          <template v-else-if="d.goal.daysToRace === 0">
            <Flag :size="40" />
            <span class="cd-sub">C’est le jour J !</span>
          </template>
          <template v-else>
            <span class="cd-sub">Course terminée — bravo !</span>
          </template>
        </div>
        <div v-if="d.currentWeek" class="hero-phase">
          <span class="phase-dot" :style="{ background: PHASE_COLORS[d.currentWeek.phase] }" aria-hidden="true" />
          <div>
            <p class="phase-name">
              Phase {{ PHASE_LABELS[d.currentWeek.phase] }}
              <span v-if="d.currentWeek.isRecovery" class="chip chip-teal">semaine allégée</span>
            </p>
            <p class="text-2">{{ d.currentWeek.focus }}</p>
          </div>
        </div>
      </section>

      <!-- Plan adapté automatiquement -->
      <div v-if="adaptation" class="adapt-banner" role="status">
        <Sparkles :size="20" class="adapt-icon" aria-hidden="true" />
        <div>
          <p><strong>Kairn a adapté ton plan</strong> · {{ adaptation.summary }}</p>
          <ul>
            <li v-for="(detail, i) in adaptation.details" :key="i">{{ detail }}</li>
          </ul>
        </div>
        <button type="button" class="btn btn-ghost btn-icon" aria-label="Masquer" @click="adaptation = undefined"><X :size="18" /></button>
      </div>

      <MorningCheckIn />

      <!-- Aujourd'hui + prochaine séance clé -->
      <div class="grid grid-2">
        <section class="card" aria-labelledby="today-title">
          <div class="card-title">
            <h2 id="today-title">Aujourd’hui</h2>
            <span class="muted today-date">{{ formatDate(today) }}</span>
          </div>
          <div v-if="todaySessions.length" class="stack">
            <div v-for="s in todaySessions" :key="s.id" class="today-item">
              <SessionCard :session="s" :show-date="false" />
              <RouterLink
                v-if="s.routineId && s.status === 'PLANNED'"
                :to="`/renfo/${s.routineId}/guidee?seance=${s.id}`"
                class="btn btn-primary"
              >
                <Play :size="18" aria-hidden="true" /> Lancer la séance guidée
              </RouterLink>
            </div>
          </div>
          <p v-else class="rest">
            <span class="rest-emoji" aria-hidden="true">🧘</span>
            Jour de repos. La progression se construit aussi pendant la récupération.
          </p>
        </section>

        <section class="card key-card" aria-labelledby="key-title">
          <div class="card-title">
            <h2 id="key-title"><Star :size="18" class="key-star" aria-hidden="true" /> Prochaine séance clé</h2>
          </div>
          <template v-if="d.nextKeySession">
            <SessionCard :session="d.nextKeySession" />
            <p class="text-2 key-objective">{{ d.nextKeySession.objective }}</p>
          </template>
          <p v-else class="muted">Aucune séance clé à venir.</p>
        </section>
      </div>

      <WeeklySummaryTeaser />

      <!-- Indicateurs -->
      <div class="grid grid-4">
        <StatTile
          label="Assiduité"
          :value="adherence ?? '—'"
          :unit="adherence !== undefined ? '%' : undefined"
          :sub="d.adherence.total ? `${d.adherence.done} faites · ${d.adherence.skipped} sautées · ${d.adherence.missed} non saisies` : 'Pas encore de séance passée'"
          tone="teal"
        />
        <StatTile
          label="Semaine en cours"
          :value="formatDuration(weekProgress.doneMin)"
          :sub="`sur ${formatDuration(weekProgress.plannedMin)} prévues · ${weekProgress.done}/${weekProgress.total} séances`"
        >
          <div class="progress" role="progressbar" :aria-valuenow="Math.round(weekProgress.ratio * 100)" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${Math.min(weekProgress.ratio * 100, 100)}%` }" />
          </div>
        </StatTile>
        <StatTile
          label="Fraîcheur le jour J"
          :value="d.raceDayForm !== undefined ? (d.raceDayForm > 0 ? '+' : '') + formatNumber(d.raceDayForm) : '—'"
          :sub="readiness?.label ?? 'Projection indisponible'"
          :tone="readiness?.tone"
        />
        <StatTile label="Durée estimée" :value="formatNumber(d.goal.estimatedDurationH, 1)" unit="h" sub="Selon ton niveau et la technicité" tone="accent" />
      </div>

      <!-- Semaine -->
      <section class="card" aria-labelledby="week-title">
        <div class="card-title">
          <h2 id="week-title">Cette semaine</h2>
          <RouterLink to="/plan" class="btn btn-ghost btn-sm">Tout le plan <ArrowRight :size="16" /></RouterLink>
        </div>
        <div class="week-grid">
          <div v-for="day in weekDays" :key="day.label" class="day" :class="{ today: day.isToday }">
            <p class="day-label">{{ day.label }}</p>
            <SessionCard v-for="s in day.sessions" :key="s.id" :session="s" compact />
            <p v-if="!day.sessions.length" class="day-rest">Repos</p>
          </div>
        </div>
      </section>

      <!-- Graphiques -->
      <section class="card" aria-labelledby="load-title">
        <div class="card-title">
          <div>
            <h2 id="load-title">Forme, fatigue et fraîcheur</h2>
            <p class="text-2 card-sub">Modèle de Banister. Vise une fraîcheur entre +5 et +35 le jour J (sur ultra, mieux vaut arriver très frais).</p>
          </div>
        </div>
        <LoadChart :points="d.load" :race-date="d.goal.raceDate" />
      </section>

      <section class="card" aria-labelledby="volume-title">
        <div class="card-title">
          <div>
            <h2 id="volume-title">Volume hebdomadaire</h2>
            <p class="text-2 card-sub">Prévu par le plan et réalisé selon tes activités importées.</p>
          </div>
        </div>
        <VolumeChart :volumes="d.volumes" :current-week-index="d.currentWeek?.index" />
      </section>

      <section v-if="training.plan?.adjustments?.length" class="card" aria-labelledby="adjust-title">
        <div class="card-title">
          <h2 id="adjust-title" class="with-icon"><History :size="18" aria-hidden="true" /> Journal des adaptations</h2>
          <RouterLink to="/plan" class="btn btn-ghost btn-sm">Voir le plan <ArrowRight :size="16" /></RouterLink>
        </div>
        <AdjustmentLog :adjustments="training.plan.adjustments" />
      </section>

      <section v-if="d.warnings.length" class="card" aria-labelledby="warn-title">
        <h2 id="warn-title" class="warn-title">À garder en tête</h2>
        <ul class="warnings">
          <li v-for="w in d.warnings" :key="w" class="alert"><TriangleAlert :size="18" aria-hidden="true" class="warn-icon" />{{ w }}</li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.adapt-banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-lg);
  background: var(--teal-soft);
  border: 1px solid color-mix(in srgb, var(--teal) 35%, transparent);
}
.adapt-icon {
  color: var(--teal);
  margin-top: 2px;
}
.adapt-banner ul {
  margin: 6px 0 0;
  padding-left: 1.1em;
  color: var(--text-2);
  font-size: 0.92rem;
}
.with-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-5);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background:
    radial-gradient(600px 300px at 100% 0%, var(--accent-soft), transparent 70%),
    linear-gradient(160deg, var(--surface), var(--surface-2));
  box-shadow: var(--shadow);
}
.hero h1 {
  font-size: clamp(2rem, 5vw, 3.2rem);
  margin-top: var(--space-2);
}
.hero-date {
  color: var(--text-2);
  margin-top: 4px;
}
.hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: var(--space-4);
  align-items: center;
}
.fact {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
}
.fact .num {
  color: var(--text);
  font-weight: 600;
}
.countdown {
  display: grid;
  justify-items: end;
  align-content: center;
  text-align: right;
  color: var(--accent);
}
.cd-label {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.1rem;
}
.cd-value {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 9vw, 6rem);
  font-weight: 700;
  line-height: 0.9;
  letter-spacing: -0.05em;
}
.cd-sub {
  color: var(--text-2);
  font-size: 0.9rem;
  margin-top: 6px;
}
.hero-phase {
  grid-column: 1 / -1;
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
.phase-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 6px;
  flex: none;
}
.phase-name {
  font-weight: 700;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.today-date {
  text-transform: capitalize;
  font-size: 0.9rem;
}
.today-item {
  display: grid;
  gap: var(--space-2);
}
.rest {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  color: var(--text-2);
}
.rest-emoji {
  font-size: 1.8rem;
}
.key-card h2 {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.key-star {
  color: var(--accent);
}
.key-objective {
  margin-top: var(--space-3);
  font-size: 0.92rem;
}
.card-sub {
  font-size: 0.88rem;
  margin-top: 4px;
}
.progress {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
  margin-top: 4px;
}
.progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.6s var(--ease);
}
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--space-2);
}
.day {
  display: grid;
  gap: 6px;
  align-content: start;
  padding: var(--space-2);
  border-radius: var(--radius);
  min-width: 0;
}
.day.today {
  background: var(--accent-soft);
  outline: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
}
.day-label {
  font-weight: 700;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.day.today .day-label {
  color: var(--accent);
}
.day-rest {
  font-size: 0.8rem;
  color: var(--muted);
  padding: var(--space-2) 0;
}
.warn-title {
  margin-bottom: var(--space-3);
}
.warnings {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-2);
}
.warn-icon {
  flex: none;
  color: var(--accent);
  margin-top: 2px;
}
.empty {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: var(--space-3);
  padding: var(--space-7) var(--space-5);
}

.skeleton {
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
}
.hero-skel {
  height: 220px;
}
.tile-skel {
  height: 110px;
}
.chart-skel {
  height: 300px;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 900px) {
  .week-grid {
    grid-template-columns: 1fr;
  }
  .day {
    grid-template-columns: 44px 1fr;
    align-items: start;
  }
  .day > :not(.day-label) {
    grid-column: 2;
  }
  .day-label {
    grid-row: 1 / span 3;
    padding-top: 8px;
  }
}
@media (max-width: 600px) {
  .hero {
    grid-template-columns: 1fr;
    padding: var(--space-5);
  }
  .countdown {
    justify-items: start;
    text-align: left;
    grid-row: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .cd-value {
    font-size: 3rem;
  }
}
</style>
