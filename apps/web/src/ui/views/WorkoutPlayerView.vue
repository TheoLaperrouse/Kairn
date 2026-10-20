<script setup lang="ts">
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pause,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useContentStore } from '../../application/stores/content'
import { useTrainingStore } from '../../application/stores/training'
import { CATEGORY_LABELS, errorMessage, formatClock, formatDuration } from '../../domain/format'
import type { Exercise, RoutineDetail } from '../../domain/models'
import { PREP_SEC, buildQueue, remainingSec, rhythmOf, type EffortStep, type QueueStep, type Side } from '../../domain/workout-queue'
import MotionDemo from '../components/MotionDemo.vue'
import { useVoiceCoach } from '../composables/use-voice-coach'
import { useWakeLock } from '../composables/use-wake-lock'

const props = defineProps<{ routineId: string; sessionId?: string }>()

const router = useRouter()
const content = useContentStore()
const training = useTrainingStore()

type Stage = 'INTRO' | 'PREP' | 'RUN' | 'DONE'

const routine = ref<RoutineDetail>()
const loadError = ref('')
const queue = ref<QueueStep[]>([])
const index = ref(0)
const stage = ref<Stage>('INTRO')
const elapsed = ref(0)
const paused = ref(false)
const activeSec = ref(0)
const quitting = ref(false)
const validating = ref(false)

const inProgress = () => stage.value !== 'INTRO' && stage.value !== 'DONE'
const { sound, announcement, toggleSound, say, beep, unlockAudio } = useVoiceCoach()
const wakeLock = useWakeLock(inProgress)

const step = computed(() => queue.value[index.value])
const effort = computed(() => (step.value?.kind === 'EFFORT' ? step.value : undefined))
const exercisesById = computed(() => new Map((routine.value?.exercises ?? []).map((e) => [e.id, e])))

function exerciseOf(id: string | undefined): Exercise | undefined {
  return id ? exercisesById.value.get(id) : undefined
}

const currentExercise = computed(() =>
  exerciseOf(step.value?.kind === 'EFFORT' ? step.value.exerciseId : step.value?.nextExerciseId),
)
const nextEffort = computed(() => queue.value.slice(index.value + 1).find((s): s is EffortStep => s.kind === 'EFFORT'))

/** Durée de la phase courante (préparation, effort chronométré ou repos) ; `undefined` pour un effort en répétitions. */
const stageDuration = computed<number | undefined>(() => {
  const s = step.value
  if (!s) return undefined
  return stage.value === 'PREP' ? PREP_SEC : s.durationSec
})
const remaining = computed(() => (stageDuration.value === undefined ? undefined : Math.max(stageDuration.value - elapsed.value, 0)))
const ringProgress = computed(() => (stageDuration.value ? Math.min(elapsed.value / stageDuration.value, 1) : 0))

const repsDone = computed(() => {
  const e = effort.value
  if (!e?.reps || stage.value !== 'RUN') return 0
  return Math.min(Math.floor(elapsed.value / e.repSec), e.reps)
})
const repsFinished = computed(() => Boolean(effort.value?.reps && repsDone.value >= effort.value.reps))
const repProgress = computed(() => {
  const e = effort.value
  if (!e?.reps || repsFinished.value) return 0
  return (elapsed.value % e.repSec) / e.repSec
})

/** Phases du tempo (ex. 3-1-1 → descente / pause / montée) et celle en cours dans la répétition. */
const tempoPhases = computed(() => {
  const e = effort.value
  if (!e?.tempo) return []
  const values = e.tempo.split(/[-–/ ]+/).map(Number)
  const names = values.length === 3 ? ['Descente', 'Pause', 'Montée'] : values.map((_, i) => `Phase ${i + 1}`)
  const position = repProgress.value * e.repSec
  let cursor = 0
  return values.map((sec, i) => {
    const active = position >= cursor && position < cursor + sec
    cursor += sec
    return { name: names[i]!, sec, active }
  })
})

const totalEfforts = computed(() => queue.value.filter((s) => s.kind === 'EFFORT').length)
const effortNumber = computed(() => queue.value.slice(0, index.value + 1).filter((s) => s.kind === 'EFFORT').length)
const progress = computed(() => (queue.value.length ? (index.value + (stage.value === 'DONE' ? 1 : 0)) / queue.value.length : 0))
const timeLeft = computed(() => Math.max(remainingSec(queue.value, index.value) - Math.min(elapsed.value, 60), 0))
const estimatedTotal = computed(() => remainingSec(queue.value, 0))

function sideName(side: Side | undefined): string {
  return side === 'GAUCHE' ? 'Côté gauche' : side === 'DROITE' ? 'Côté droit' : ''
}
const sideLabel = computed(() => sideName(effort.value?.side))

onMounted(async () => {
  try {
    routine.value = await content.routine(props.routineId)
    queue.value = buildQueue(
      routine.value.blocks,
      Object.fromEntries(routine.value.exercises.map((e) => [e.id, rhythmOf(e)])),
    )
  } catch (error) {
    loadError.value = errorMessage(error, 'Routine introuvable')
  }
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  stopClock()
  window.removeEventListener('keydown', onKey)
})

let timer: number | undefined
let lastTick = 0
let lastBeep = -1
let finishedAt = 0

function startClock() {
  stopClock()
  lastTick = performance.now()
  timer = window.setInterval(tick, 100)
}

function stopClock() {
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
}

function tick() {
  const now = performance.now()
  const delta = (now - lastTick) / 1000
  lastTick = now
  if (paused.value || quitting.value || !inProgress()) return
  elapsed.value += delta
  activeSec.value += delta

  const left = remaining.value
  if (left !== undefined) {
    const whole = Math.ceil(left)
    if (whole <= 3 && whole >= 1 && whole !== lastBeep) {
      lastBeep = whole
      beep(whole === 1 ? 660 : 520, 0.09)
    }
    if (left <= 0) return advanceStage()
  }
  // Répétitions terminées : petit délai pour souffler, puis on enchaîne.
  if (effort.value?.reps && stage.value === 'RUN' && elapsed.value >= effort.value.reps * effort.value.repSec + 2.5) {
    advanceStage()
  }
}

function resetStageClock() {
  elapsed.value = 0
  lastBeep = -1
}

function begin() {
  unlockAudio()
  void wakeLock.request()
  index.value = 0
  activeSec.value = 0
  enterStep()
  startClock()
}

function enterStep() {
  resetStageClock()
  const s = step.value
  if (!s) return finish()
  if (s.kind === 'REPOS') {
    stage.value = 'RUN'
    const next = exerciseOf(s.nextExerciseId)
    const previousStep = queue.value[index.value - 1]
    const changing = previousStep?.kind === 'EFFORT' && previousStep.exerciseId !== s.nextExerciseId
    say(changing && next ? `Repos. Prochain exercice : ${next.name}.` : 'Repos.')
    return
  }
  if (s.needsPrep) {
    stage.value = 'PREP'
    const name = exerciseOf(s.exerciseId)?.name ?? ''
    const side = s.side ? `${sideName(s.side)}.` : ''
    say(s.firstOfBlock ? `${name}. ${side} Prépare-toi.` : `On change. ${side}`)
    return
  }
  startEffort()
}

function startEffort() {
  stage.value = 'RUN'
  resetStageClock()
  const e = effort.value
  if (!e) return
  const last = e.lastSet && e.totalSets > 1 && e.side !== 'GAUCHE' ? ' Dernière série !' : ''
  const amount = e.durationSec ? `${e.durationSec} secondes.` : e.reps ? `${e.reps} répétitions.` : ''
  say(`C'est parti ! ${amount}${last}`)
  beep(880, 0.16)
}

function advanceStage() {
  if (stage.value === 'PREP') return startEffort()
  goTo(index.value + 1)
}

function goTo(target: number) {
  if (target >= queue.value.length) return finish()
  index.value = Math.max(target, 0)
  paused.value = false
  enterStep()
}

function previous() {
  goTo(index.value - 1)
}

function next() {
  goTo(index.value + 1)
}

function togglePause() {
  if (!inProgress()) return
  paused.value = !paused.value
  say(paused.value ? 'Pause.' : 'On reprend.')
}

function finish() {
  stopClock()
  stage.value = 'DONE'
  finishedAt = activeSec.value
  say('Séance terminée. Bravo !')
  beep(660, 0.12)
  window.setTimeout(() => beep(990, 0.2), 160)
  void wakeLock.release()
}

const summary = computed(() => ({
  duration: formatDuration((finishedAt || activeSec.value) / 60),
  exercises: routine.value?.exercises.length ?? 0,
  sets: totalEfforts.value,
}))

async function validate() {
  validating.value = true
  try {
    if (props.sessionId) {
      await training.updateSession(props.sessionId, { status: 'DONE' })
      await router.push(`/seance/${props.sessionId}`)
    } else {
      await router.push('/exercices')
    }
  } finally {
    validating.value = false
  }
}

function exitPath() {
  return props.sessionId ? `/seance/${props.sessionId}` : '/exercices'
}

function askQuit() {
  if (!inProgress()) return void router.push(exitPath())
  quitting.value = true
  void nextTick(() => document.getElementById('quit-confirm')?.focus())
}

function confirmQuit() {
  quitting.value = false
  void router.push(exitPath())
}

function onKey(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'Escape') {
    event.preventDefault()
    if (quitting.value) quitting.value = false
    else askQuit()
    return
  }
  if (quitting.value || !inProgress()) return
  if (event.key === ' ') {
    event.preventDefault()
    togglePause()
  } else if (event.key === 'ArrowRight') next()
  else if (event.key === 'ArrowLeft') previous()
}

watch(quitting, (open) => {
  if (open) window.speechSynthesis?.pause()
  else window.speechSynthesis?.resume()
})

const RING = 2 * Math.PI * 54
</script>

<template>
  <div class="player">
    <p class="visually-hidden" aria-live="assertive">{{ announcement }}</p>

    <header class="bar">
      <button class="icon-btn" type="button" aria-label="Quitter la séance" @click="askQuit"><X :size="22" /></button>
      <div class="bar-title">
        <span class="eyebrow">Séance guidée</span>
        <strong>{{ routine?.name ?? 'Chargement…' }}</strong>
      </div>
      <button class="icon-btn" type="button" :aria-pressed="sound" :aria-label="sound ? 'Couper le son' : 'Activer le son'" @click="toggleSound">
        <component :is="sound ? Volume2 : VolumeX" :size="22" />
      </button>
    </header>
    <div
      class="progress"
      role="progressbar"
      :aria-valuenow="Math.round(progress * 100)"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="Progression de la séance"
    >
      <span :style="{ transform: `scaleX(${progress})` }" />
    </div>

    <p v-if="loadError" class="state-msg">{{ loadError }}</p>

    <section v-else-if="routine && stage === 'INTRO'" class="intro">
      <div class="intro-head">
        <span class="eyebrow">{{ formatDuration(estimatedTotal / 60) }} · {{ totalEfforts }} séries</span>
        <h1>{{ routine.name }}</h1>
        <p class="lead">{{ routine.description }}</p>
      </div>
      <ol class="intro-list">
        <li v-for="(block, i) in routine.blocks" :key="i">
          <span class="intro-index num">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="intro-name">{{ exerciseOf(block.exerciseId)?.name ?? block.exerciseId }}</span>
          <span class="intro-dose num">
            {{ block.sets }} × {{ block.durationSec ? `${block.durationSec} s` : `${block.reps}` }}{{ block.perSide ? ' /côté' : '' }}
          </span>
        </li>
      </ol>
      <div class="intro-actions">
        <button class="go" type="button" @click="begin"><Play :size="24" /> Commencer</button>
        <p class="hint">Pose le téléphone face à toi. Espace : pause · ← → : naviguer · Échap : quitter</p>
      </div>
    </section>

    <section v-else-if="routine && step && stage !== 'DONE'" class="stage" :class="{ resting: step.kind === 'REPOS' }">
      <div class="demo-wrap">
        <MotionDemo
          v-if="currentExercise"
          :exercise="currentExercise"
          :paused="paused || step.kind === 'REPOS' || stage === 'PREP'"
          :cycle-ms="effort?.reps ? effort.animationCycleMs : undefined"
          :show-labels="step.kind === 'EFFORT'"
        />
        <div v-if="stage === 'PREP'" class="prep-overlay">
          <span class="eyebrow">Prépare-toi</span>
          <span class="prep-count num">{{ Math.max(Math.ceil(remaining ?? 0), 1) }}</span>
          <span v-if="sideLabel" class="side-pill">{{ sideLabel }}</span>
        </div>
        <div v-if="step.kind === 'REPOS'" class="rest-tag"><Clock :size="16" /> Repos — prochain : {{ currentExercise?.name }}</div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <span class="eyebrow">
            <template v-if="step.kind === 'EFFORT'">
              Exercice {{ step.blockIndex + 1 }}/{{ routine.blocks.length }} · {{ CATEGORY_LABELS[currentExercise?.category ?? 'FORCE'] }}
            </template>
            <template v-else>Récupération</template>
          </span>
          <h2>{{ step.kind === 'EFFORT' ? currentExercise?.name : 'Repos' }}</h2>
          <div v-if="effort" class="meta-row">
            <span class="pill">Série {{ effort.set }}/{{ effort.totalSets }}</span>
            <span v-if="sideLabel" class="pill pill-accent">{{ sideLabel }}</span>
            <span v-if="effort.tempo" class="pill">Tempo {{ effort.tempo }}</span>
            <span v-if="effort.lastSet && effort.totalSets > 1" class="pill pill-teal">Dernière série</span>
          </div>
        </div>

        <div v-if="stageDuration !== undefined" class="ring-wrap">
          <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="54" class="ring-track" />
            <circle
              cx="60"
              cy="60"
              r="54"
              class="ring-value"
              :class="{ rest: step.kind === 'REPOS' }"
              :stroke-dasharray="RING"
              :stroke-dashoffset="RING * (1 - ringProgress)"
            />
          </svg>
          <div class="ring-label">
            <span class="big num">{{ formatClock(remaining ?? 0) }}</span>
            <span class="muted">{{ stage === 'PREP' ? 'préparation' : step.kind === 'REPOS' ? 'repos' : 'maintien' }}</span>
          </div>
        </div>

        <div v-else-if="effort?.reps" class="reps">
          <div class="reps-count">
            <span class="big num">{{ repsFinished ? effort.reps : repsDone + 1 }}</span>
            <span class="reps-total num">/ {{ effort.reps }}</span>
          </div>
          <div class="rep-bar"><span :style="{ transform: `scaleX(${repsFinished ? 1 : repProgress})` }" /></div>
          <div v-if="tempoPhases.length" class="tempo">
            <span v-for="p in tempoPhases" :key="p.name" class="tempo-phase" :class="{ active: p.active && !repsFinished }">
              {{ p.name }} <small class="num">{{ p.sec }} s</small>
            </span>
          </div>
          <button class="done-btn" :class="{ ready: repsFinished }" type="button" @click="next">
            <Check :size="20" /> Série terminée
          </button>
        </div>

        <ul v-if="step.kind === 'EFFORT' && currentExercise" class="cues">
          <li v-for="cue in currentExercise.cues.slice(0, 3)" :key="cue">{{ cue }}</li>
        </ul>
        <p v-if="effort?.notes" class="notes">{{ effort.notes }}</p>

        <div v-if="step.kind === 'REPOS' && nextEffort" class="next-up">
          <span class="eyebrow">Ensuite</span>
          <strong>{{ exerciseOf(nextEffort.exerciseId)?.name }}</strong>
          <span class="muted">
            Série {{ nextEffort.set }}/{{ nextEffort.totalSets }} ·
            {{ nextEffort.durationSec ? `${nextEffort.durationSec} s` : `${nextEffort.reps} répétitions` }}
          </span>
          <button class="ghost-btn" type="button" @click="next"><SkipForward :size="18" /> Passer le repos</button>
        </div>

        <div class="controls">
          <button class="icon-btn lg" type="button" aria-label="Étape précédente" :disabled="index === 0" @click="previous">
            <ChevronLeft :size="26" />
          </button>
          <button class="play-btn" type="button" :aria-label="paused ? 'Reprendre' : 'Pause'" @click="togglePause">
            <component :is="paused ? Play : Pause" :size="30" />
          </button>
          <button class="icon-btn lg" type="button" aria-label="Étape suivante" @click="next"><ChevronRight :size="26" /></button>
        </div>
        <p class="footer-meta num">
          Série {{ effortNumber }}/{{ totalEfforts }} · encore ~{{ formatDuration(timeLeft / 60) }}
        </p>
      </div>
      <div v-if="paused" class="paused-veil" @click="togglePause">
        <Play :size="44" />
        <span>En pause — touche pour reprendre</span>
      </div>
    </section>

    <section v-else-if="routine && stage === 'DONE'" class="done">
      <div class="done-badge"><Check :size="44" /></div>
      <h1>Séance terminée</h1>
      <p class="lead">Tes quadriceps te remercieront dans la prochaine descente.</p>
      <dl class="recap">
        <div><dt>Durée</dt><dd class="num">{{ summary.duration }}</dd></div>
        <div><dt>Exercices</dt><dd class="num">{{ summary.exercises }}</dd></div>
        <div><dt>Séries</dt><dd class="num">{{ summary.sets }}</dd></div>
      </dl>
      <div class="done-actions">
        <button class="go" type="button" :disabled="validating" @click="validate">
          <Check :size="22" /> {{ sessionId ? 'Valider la séance' : 'Terminer' }}
        </button>
        <button class="ghost-btn" type="button" @click="router.push(exitPath())"><ArrowLeft :size="18" /> Retour</button>
      </div>
    </section>

    <p v-else class="state-msg">Chargement de la séance…</p>

    <div v-if="quitting" class="modal-backdrop" @click.self="quitting = false">
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="quit-title" aria-describedby="quit-desc">
        <h2 id="quit-title">Quitter la séance ?</h2>
        <p id="quit-desc" class="muted">Ta progression dans cette séance ne sera pas enregistrée.</p>
        <div class="modal-actions">
          <button class="ghost-btn" type="button" @click="quitting = false">Continuer</button>
          <button id="quit-confirm" class="danger-btn" type="button" @click="confirmQuit">Quitter</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Fond sombre immersif, quel que soit le thème de l'application. */
.player {
  color-scheme: dark;
  --bg: #0b1424;
  --surface: #131f33;
  --surface-2: #19283f;
  --surface-3: #22344f;
  --border: #22324b;
  --border-strong: #34496a;
  --text: #eaf2f8;
  --text-2: #b4c2d4;
  --muted: #7a8ca5;
  --accent: #f28c38;
  --accent-ink: #1d1004;
  --accent-soft: rgb(242 140 56 / 0.16);
  --teal: #5fd1c1;
  --teal-soft: rgb(95 209 193 / 0.14);
  --figure: #eaf2f8;
  --figure-far: #4d6283;

  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(900px 500px at 20% 0%, #16294a, transparent 65%),
    radial-gradient(700px 400px at 100% 100%, rgb(242 140 56 / 0.08), transparent 60%),
    var(--bg);
  color: var(--text);
  overflow: hidden;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}
.bar-title {
  display: grid;
  text-align: center;
  min-width: 0;
}
.bar-title strong {
  font-family: var(--font-display);
  font-size: 1.05rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.progress {
  height: 4px;
  background: var(--surface-2);
}
.progress span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--teal), var(--accent));
  transform-origin: left;
  transition: transform 0.4s var(--ease);
}

.icon-btn,
.play-btn,
.go,
.ghost-btn,
.danger-btn,
.done-btn {
  border: 0;
  cursor: pointer;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition:
    transform 0.15s var(--ease),
    background 0.15s var(--ease);
}
.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text);
}
.icon-btn.lg {
  width: 56px;
  height: 56px;
}
.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.icon-btn:not(:disabled):hover {
  background: var(--surface-3);
}
.play-btn {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: 0 10px 30px -10px rgb(242 140 56 / 0.7);
}
.play-btn:active,
.go:active,
.icon-btn:active {
  transform: scale(0.95);
}
.go {
  min-height: 60px;
  padding: 0 32px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 1.15rem;
  box-shadow: 0 12px 32px -12px rgb(242 140 56 / 0.8);
}
.go:disabled {
  opacity: 0.6;
}
.ghost-btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text);
}
.ghost-btn:hover {
  background: var(--surface-3);
}
.danger-btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  background: #f06a6a;
  color: #1a0505;
}

.state-msg {
  margin: auto;
  color: var(--text-2);
}

.intro {
  flex: 1;
  overflow-y: auto;
  width: min(760px, 100%);
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  display: grid;
  align-content: start;
  gap: var(--space-5);
}
.intro-head h1 {
  margin: 6px 0 10px;
  font-size: clamp(2rem, 6vw, 3rem);
}
.lead {
  color: var(--text-2);
  max-width: 60ch;
}
.intro-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.intro-list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: 12px 16px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}
.intro-index {
  color: var(--accent);
  font-weight: 700;
}
.intro-name {
  font-weight: 600;
}
.intro-dose {
  color: var(--text-2);
}
.intro-actions {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  padding-bottom: var(--space-5);
}
.hint {
  color: var(--muted);
  font-size: 0.85rem;
  text-align: center;
}

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 1fr);
  gap: var(--space-5);
  padding: var(--space-4) var(--space-5) var(--space-5);
}
.demo-wrap {
  position: relative;
  min-height: 0;
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 50% 60%, rgb(95 209 193 / 0.08), transparent 65%),
    var(--surface);
  border: 1px solid var(--border);
  padding: var(--space-5);
  display: grid;
  overflow: hidden;
  transition: opacity 0.3s var(--ease);
}
.stage.resting .demo-wrap {
  opacity: 0.6;
}
.prep-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-2);
  background: rgb(11 20 36 / 0.72);
  backdrop-filter: blur(3px);
}
.prep-count {
  font-size: clamp(6rem, 20vw, 11rem);
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
  animation: pop 1s var(--ease) infinite;
}
@keyframes pop {
  0% {
    transform: scale(1.15);
    opacity: 0.6;
  }
  30% {
    transform: scale(1);
    opacity: 1;
  }
}
.side-pill {
  padding: 6px 16px;
  border-radius: 999px;
  background: var(--teal-soft);
  color: var(--teal);
  font-weight: 700;
  font-size: 1.1rem;
}
.rest-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 0.85rem;
  font-weight: 600;
}

.panel {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.panel-head h2 {
  font-size: clamp(1.6rem, 3.4vw, 2.4rem);
  margin: 4px 0 10px;
}
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pill {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 0.85rem;
  font-weight: 650;
}
.pill-accent {
  background: var(--accent-soft);
  color: var(--accent);
}
.pill-teal {
  background: var(--teal-soft);
  color: var(--teal);
}

.ring-wrap {
  position: relative;
  width: min(260px, 70%);
  aspect-ratio: 1;
  align-self: center;
}
.ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-track {
  fill: none;
  stroke: var(--surface-2);
  stroke-width: 8;
}
.ring-value {
  fill: none;
  stroke: var(--accent);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.12s linear;
}
.ring-value.rest {
  stroke: var(--teal);
}
.ring-label {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
}
.big {
  font-size: clamp(3.2rem, 9vw, 5.2rem);
  font-weight: 700;
  line-height: 1;
}

.reps {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
}
.reps-count {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.reps-count .big {
  font-size: clamp(5rem, 14vw, 8rem);
  color: var(--accent);
}
.reps-total {
  font-size: 2rem;
  color: var(--muted);
}
.rep-bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.rep-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
}
.tempo {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}
.tempo-phase {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.15s var(--ease);
}
.tempo-phase.active {
  background: var(--teal-soft);
  border-color: var(--teal);
  color: var(--teal);
}
.done-btn {
  min-height: 52px;
  padding: 0 24px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 1.05rem;
}
.done-btn.ready {
  background: var(--teal);
  color: #04201c;
  animation: breathe 1.2s var(--ease) infinite alternate;
}
@keyframes breathe {
  to {
    transform: scale(1.05);
  }
}

.cues {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}
.cues li {
  position: relative;
  padding: 10px 14px 10px 36px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-2);
}
.cues li::before {
  content: '';
  position: absolute;
  left: 14px;
  top: 17px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--teal);
}
.notes {
  color: var(--muted);
  font-size: 0.9rem;
}
.next-up {
  display: grid;
  gap: 4px;
  justify-items: start;
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}
.next-up strong {
  font-family: var(--font-display);
  font-size: 1.3rem;
}
.next-up .ghost-btn {
  margin-top: var(--space-2);
}
.controls {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
  padding-top: var(--space-3);
}
.footer-meta {
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
}
.paused-veil {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-3);
  background: rgb(11 20 36 / 0.75);
  backdrop-filter: blur(4px);
  color: var(--text);
  font-weight: 600;
  cursor: pointer;
}

.done {
  flex: 1;
  overflow-y: auto;
  display: grid;
  align-content: center;
  justify-items: center;
  text-align: center;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-4);
}
.done-badge {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--teal-soft);
  color: var(--teal);
  animation: pop 0.6s var(--ease) 1;
}
.done h1 {
  font-size: clamp(2rem, 6vw, 3rem);
}
.recap {
  display: grid;
  grid-template-columns: repeat(3, minmax(90px, 1fr));
  gap: var(--space-3);
  margin: var(--space-3) 0;
}
.recap div {
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}
.recap dt {
  color: var(--muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.recap dd {
  margin: 4px 0 0;
  font-size: 1.6rem;
  font-weight: 700;
}
.done-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: center;
}

.modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: rgb(4 8 16 / 0.7);
}
.modal {
  width: min(420px, 100%);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  display: grid;
  gap: var(--space-3);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

/* Portrait / mobile : démo en haut, infos en dessous */
@media (max-width: 860px), (orientation: portrait) {
  .stage {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(200px, 42%) 1fr;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) var(--space-4);
  }
  .demo-wrap {
    padding: var(--space-3);
  }
  .ring-wrap {
    width: min(190px, 55vw);
  }
  .panel {
    gap: var(--space-3);
  }
  .panel-head h2 {
    margin-bottom: 6px;
  }
  .controls {
    gap: var(--space-4);
  }
}
</style>
