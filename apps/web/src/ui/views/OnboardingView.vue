<script setup lang="ts">
import { ArrowLeft, ArrowRight, Check } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../application/stores/auth'
import { useTrainingStore } from '../../application/stores/training'
import { addDaysIso, errorMessage, todayIso } from '../../domain/format'
import type { AthleteProfile, RaceGoal } from '../../domain/models'
import GoalForm from '../components/GoalForm.vue'
import KairnLogo from '../components/KairnLogo.vue'
import ProfileForm from '../components/ProfileForm.vue'
import OnboardingRecap from './onboarding/OnboardingRecap.vue'
import PlanGenerating from './onboarding/PlanGenerating.vue'

const training = useTrainingStore()
const auth = useAuthStore()
const router = useRouter()

const STEPS = ['Objectif', 'Profil', 'Récapitulatif'] as const
const step = ref(0)
const error = ref('')
const generating = ref(false)

function defaultGoal(): RaceGoal {
  return {
    name: '',
    raceDate: addDaysIso(todayIso(), 7 * 20),
    distanceKm: 80,
    elevationGainM: 4000,
    technicity: 3,
    polesAllowed: true,
    nightSections: true,
  }
}

function defaultProfile(): AthleteProfile {
  return {
    name: auth.user?.displayName ?? '',
    level: 'INTERMEDIATE',
    currentWeeklyKm: 30,
    currentWeeklyElevationM: 600,
    availableDays: [1, 3, 5, 6],
    longRunDay: 5,
    maxWeeklyHours: 10,
    terrain: 'HILLS',
    crossTraining: { cycling: false, cyclingSessionsPerWeek: 1, strength: true, strengthSessionsPerWeek: 1 },
  }
}

const goal = ref<RaceGoal>(defaultGoal())
const profile = ref<AthleteProfile>(defaultProfile())

onMounted(async () => {
  await training.load()
  if (training.goal) goal.value = { ...training.goal }
  if (training.profile) profile.value = { ...training.profile }
})

const goalValid = computed(
  () => goal.value.name.trim().length > 0 && goal.value.raceDate > todayIso() && goal.value.distanceKm > 0 && goal.value.elevationGainM >= 0,
)
const profileValid = computed(
  () =>
    profile.value.name.trim().length > 0 &&
    profile.value.availableDays.length >= 3 &&
    profile.value.availableDays.includes(profile.value.longRunDay),
)
const canContinue = computed(() => (step.value === 0 ? goalValid.value : step.value === 1 ? profileValid.value : true))

const weeksToRace = computed(() => Math.floor((Date.parse(goal.value.raceDate) - Date.parse(todayIso())) / (7 * 86_400_000)))

function next() {
  error.value = ''
  if (step.value < STEPS.length - 1) step.value++
}

function back() {
  error.value = ''
  if (step.value > 0) step.value--
}

async function generate() {
  error.value = ''
  generating.value = true
  try {
    await training.saveGoal(goal.value)
    await training.saveProfile(profile.value)
    // Leave time to see the animation: the server computation is nearly instant.
    await Promise.all([training.generatePlan(), new Promise((r) => setTimeout(r, 2600))])
    await router.replace('/')
  } catch (e) {
    error.value = errorMessage(e, 'La génération a échoué')
    generating.value = false
  }
}
</script>

<template>
  <div class="onboarding">
    <PlanGenerating v-if="generating" :goal="goal" />

    <template v-else>
      <header class="head">
        <div class="brand"><KairnLogo /> <span>Kairn</span></div>
        <ol class="progress" aria-label="Étapes">
          <li v-for="(label, i) in STEPS" :key="label" :class="{ done: i < step, current: i === step }" :aria-current="i === step ? 'step' : undefined">
            <span class="dot"><Check v-if="i < step" :size="14" aria-hidden="true" /><template v-else>{{ i + 1 }}</template></span>
            <span class="label">{{ label }}</span>
          </li>
        </ol>
      </header>

      <main class="body">
        <section v-if="step === 0" class="stack-lg">
          <div>
            <p class="eyebrow">Étape 1 sur 3</p>
            <h1>Quel est ton objectif ?</h1>
            <p class="lead">Tout le plan découle de ta course : distance, dénivelé, technicité, nuit.</p>
          </div>
          <GoalForm v-model="goal" />
        </section>

        <section v-else-if="step === 1" class="stack-lg">
          <div>
            <p class="eyebrow">Étape 2 sur 3</p>
            <h1>Parle-nous de toi</h1>
            <p class="lead">Ton niveau et tes disponibilités calibrent le volume et la progression.</p>
          </div>
          <ProfileForm v-model="profile" />
        </section>

        <section v-else class="stack-lg">
          <div>
            <p class="eyebrow">Étape 3 sur 3</p>
            <h1>Prêt·e pour {{ goal.name }} ?</h1>
            <p class="lead">Vérifie le récapitulatif : tu pourras tout modifier ensuite dans les réglages.</p>
          </div>
          <OnboardingRecap :goal="goal" :profile="profile" :weeks-to-race="weeksToRace" @edit="step = 1" />
          <p v-if="weeksToRace < 8" class="alert">
            Moins de 8 semaines avant la course : le plan sera compressé. Écoute bien ton corps.
          </p>
        </section>

        <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      </main>

      <footer class="foot">
        <button v-if="step > 0" type="button" class="btn btn-ghost" @click="back"><ArrowLeft :size="18" aria-hidden="true" /> Retour</button>
        <span v-else />
        <button v-if="step < STEPS.length - 1" type="button" class="btn btn-primary" :disabled="!canContinue" @click="next">
          Continuer <ArrowRight :size="18" aria-hidden="true" />
        </button>
        <button v-else type="button" class="btn btn-primary" @click="generate">Générer mon plan <ArrowRight :size="18" aria-hidden="true" /></button>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.onboarding {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.25rem;
}
.progress {
  display: flex;
  gap: var(--space-4);
  list-style: none;
  margin: 0;
  padding: 0;
}
.progress li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.9rem;
}
.dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-strong);
  font-size: 0.8rem;
}
.progress li.current {
  color: var(--text);
}
.progress li.current .dot {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: transparent;
}
.progress li.done .dot {
  background: var(--teal-soft);
  color: var(--teal);
  border-color: transparent;
}
.body {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-5) var(--space-7);
  display: grid;
  gap: var(--space-5);
  align-content: start;
}
.stack-lg {
  display: grid;
  gap: var(--space-5);
}
.lead {
  color: var(--text-2);
  margin-top: var(--space-2);
}
.foot {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5) max(var(--space-3), env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
}
@media (max-width: 640px) {
  .progress .label {
    display: none;
  }
  .body {
    padding: var(--space-5) var(--space-4) var(--space-6);
  }
  .head,
  .foot {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }
}
</style>
