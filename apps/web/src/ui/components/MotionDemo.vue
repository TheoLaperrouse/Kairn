<script lang="ts">
/** Availability of the exported MP4s, checked only once per file for the whole app. */
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

/** Jumps playback back to the start of the clip as soon as it reaches its end: seamless loop. */
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
// The film is timed to the catalogue tempo; playback speed is adjusted to the tempo the session asks for.
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
  /* Flex rather than grid: the demo inherits a defined height and never overflows its frame. */
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
