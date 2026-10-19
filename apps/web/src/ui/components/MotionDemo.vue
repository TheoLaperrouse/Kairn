<script lang="ts">
/** Disponibilité des MP4 exportés, vérifiée une seule fois par fichier pour toute l'app. */
const availability = new Map<string, Promise<boolean>>()

function isAvailable(src: string): Promise<boolean> {
  let pending = availability.get(src)
  if (!pending) {
    pending = fetch(src, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('video/'))
      .catch(() => false)
    availability.set(src, pending)
  }
  return pending
}
</script>

<script setup lang="ts">
/**
 * Démonstration d'un exercice :
 * passage du film Claude Motion en boucle si le MP4 a été exporté,
 * sinon animation anatomique calculée en direct à partir des mêmes poses-clés.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Exercise } from '../../domain/models'
import { motionClipFor } from '../../domain/motion-films'
import ExerciseFigure from './ExerciseFigure.vue'

const props = withDefaults(
  defineProps<{
    exercise: Pick<Exercise, 'id' | 'name' | 'muscles' | 'animation'>
    paused?: boolean
    cycleMs?: number
    showLabels?: boolean
  }>(),
  { paused: false, showLabels: true },
)

const clip = computed(() => motionClipFor(props.exercise.id))
const hasVideo = ref(false)
const video = ref<HTMLVideoElement>()
let frameHandle = 0

watch(
  clip,
  async (value) => {
    hasVideo.value = false
    if (value) hasVideo.value = await isAvailable(value.src)
  },
  { immediate: true },
)

/** Ramène la lecture au début du passage dès qu'on atteint sa fin : boucle sans couture. */
function keepInSegment() {
  const el = video.value
  const c = clip.value
  if (el && c && (el.currentTime >= c.end - 0.05 || el.currentTime < c.start - 0.1)) el.currentTime = c.start
  frameHandle = requestAnimationFrame(keepInSegment)
}

function syncPlayback() {
  const el = video.value
  if (!el) return
  if (props.paused) el.pause()
  else void el.play().catch(() => {})
}

function onLoaded() {
  if (video.value && clip.value) video.value.currentTime = clip.value.start
  cancelAnimationFrame(frameHandle)
  frameHandle = requestAnimationFrame(keepInSegment)
  syncPlayback()
}

function onError() {
  hasVideo.value = false
  if (clip.value) availability.set(clip.value.src, Promise.resolve(false))
}

watch(() => props.paused, syncPlayback)
watch(
  () => props.exercise.id,
  () => {
    if (video.value && clip.value && hasVideo.value) {
      video.value.currentTime = clip.value.start
      syncPlayback()
    }
  },
)
// Le film est calé sur le tempo du catalogue ; on ajuste la vitesse au tempo demandé par la séance.
watch(
  [() => props.cycleMs, video],
  () => {
    if (!video.value || !clip.value) return
    const rate = props.cycleMs ? Math.min(Math.max((clip.value.cycleSec * 1000) / props.cycleMs, 0.25), 2) : 1
    video.value.playbackRate = rate
  },
  { immediate: true },
)

onBeforeUnmount(() => cancelAnimationFrame(frameHandle))
</script>

<template>
  <div class="demo">
    <video
      v-if="hasVideo && clip"
      ref="video"
      class="video"
      :src="`${clip.src}#t=${clip.start}`"
      muted
      playsinline
      preload="auto"
      disablepictureinpicture
      :aria-label="`Démonstration vidéo : ${exercise.name}`"
      @loadedmetadata="onLoaded"
      @error="onError"
    />
    <ExerciseFigure v-else :exercise="exercise" :paused="paused" :cycle-ms="cycleMs" :show-labels="showLabels" />
  </div>
</template>

<style scoped>
.demo {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  /* Flex plutôt que grille : la démo hérite d'une hauteur définie et ne déborde jamais du cadre. */
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.demo > :deep(svg) {
  max-width: 100%;
  max-height: 100%;
}
.video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: inherit;
  background: #0f1b2d;
}
</style>
