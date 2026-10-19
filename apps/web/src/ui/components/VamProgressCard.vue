<script setup lang="ts">
/**
 * Progression en côte : meilleure VAM tenue 5, 10, 20 ou 30 min, semaine après semaine.
 * Une seule durée à la fois (pas de légende de couleurs à déchiffrer), avec le record
 * et la tendance des 4 dernières semaines face aux 8 précédentes.
 */
import { Mountain, TrendingDown, TrendingUp, Trophy } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../../application/api-provider'
import { formatLongDate, formatNumber, formatShortDate, formatWeekRange } from '../../domain/format'
import type { VamDuration, VamMark, VamProgress } from '../../domain/models'

const api = useApi()
const router = useRouter()
const progress = ref<VamProgress>()
const duration = ref<VamDuration>(10)
const DURATIONS: VamDuration[] = [5, 10, 20, 30]

onMounted(async () => {
  progress.value = await api.vamProgress(26).catch(() => undefined)
  // Durée par défaut : la plus longue pour laquelle on a déjà un record (sinon 10 min).
  const recorded = DURATIONS.filter((d) => progress.value?.records[d])
  if (recorded.length && !recorded.includes(duration.value)) duration.value = recorded.at(-1)!
})

const container = ref<HTMLDivElement>()
const width = ref(640)
let observer: ResizeObserver | undefined
// Le graphique n'existe qu'une fois les données chargées : on le mesure dès qu'il apparaît.
watch(container, (element) => {
  observer?.disconnect()
  if (!element) return
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.max(entry.contentRect.width, 260)
  })
  observer.observe(element)
})
onBeforeUnmount(() => observer?.disconnect())

const HEIGHT = 220
const PAD = { top: 18, right: 14, bottom: 28, left: 46 }
const RECENT_WEEKS = 4

const hasData = computed(() => Boolean(progress.value && DURATIONS.some((d) => progress.value!.records[d])))
const record = computed(() => progress.value?.records[duration.value])
const trend = computed(() => progress.value?.trend[duration.value])
const points = computed(() =>
  (progress.value?.weeks ?? []).map((w, i) => ({ i, weekStart: w.weekStart, mark: w.best[duration.value] as VamMark | undefined })),
)

function niceStep(range: number, target: number): number {
  const raw = range / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  return (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude
}

const scale = computed(() => {
  const values = points.value.flatMap((p) => (p.mark ? [p.mark.vam] : []))
  if (record.value) values.push(record.value.vam)
  const lo = Math.min(...values, 600)
  const hi = Math.max(...values, 700)
  const step = niceStep(hi - lo + 100, 4)
  const min = Math.max(0, Math.floor((lo - 50) / step) * step)
  const max = Math.ceil((hi + 30) / step) * step
  const ticks: number[] = []
  for (let v = min; v <= max; v += step) ticks.push(v)
  const innerW = width.value - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const slot = innerW / Math.max(points.value.length, 1)
  return {
    ticks,
    slot,
    x: (i: number) => PAD.left + slot * (i + 0.5),
    y: (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH,
  }
})

/** Segments reliant deux semaines consécutives avec une montée ; une semaine sans montée coupe la ligne. */
const segments = computed(() => {
  const list: string[] = []
  const pts = points.value
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!
    const b = pts[k]!
    if (a.mark && b.mark) list.push(`M${scale.value.x(a.i)},${scale.value.y(a.mark.vam)} L${scale.value.x(b.i)},${scale.value.y(b.mark.vam)}`)
  }
  return list.join(' ')
})

const monthTicks = computed(() => {
  const starts = points.value.filter((p, k) => k > 0 && p.weekStart.slice(5, 7) !== points.value[k - 1]!.weekStart.slice(5, 7))
  return starts.map((p) => ({ i: p.i, label: formatShortDate(p.weekStart).replace(/^\d+\s/, '') }))
})

const recentBand = computed(() => {
  const n = points.value.length
  if (n < RECENT_WEEKS) return undefined
  const x1 = PAD.left + scale.value.slot * (n - RECENT_WEEKS)
  return { x: x1, width: PAD.left + scale.value.slot * n - x1 }
})

const hover = ref<(typeof points.value)[number]>()
function onMove(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const px = ((event.clientX - rect.left) / rect.width) * width.value
  const index = Math.floor((px - PAD.left) / scale.value.slot)
  hover.value = points.value[index]?.mark ? points.value[index] : undefined
}
function open() {
  if (hover.value?.mark) void router.push(`/activites/${hover.value.mark.activityId}`)
}

const tooltipStyle = computed(() => {
  if (!hover.value?.mark) return {}
  const x = scale.value.x(hover.value.i)
  const flip = x > width.value - 180
  return { left: `${x}px`, top: `${scale.value.y(hover.value.mark.vam)}px`, transform: flip ? 'translate(calc(-100% - 12px), -50%)' : 'translate(12px, -50%)' }
})

const ariaLabel = computed(() => {
  const marked = points.value.filter((p) => p.mark)
  return `Meilleure VAM sur ${duration.value} min, semaine par semaine : ${marked.length} semaines avec une montée${record.value ? `, record ${record.value.vam} m/h` : ''}.`
})
</script>

<template>
  <section class="card" aria-labelledby="vam-title">
    <div class="card-title">
      <h2 id="vam-title"><Mountain :size="20" aria-hidden="true" /> Progression en montée</h2>
      <div v-if="hasData" class="durations" role="group" aria-label="Durée de l’effort">
        <button
          v-for="d in DURATIONS"
          :key="d"
          type="button"
          class="chip chip-toggle"
          :aria-pressed="duration === d"
          @click="duration = d"
        >
          {{ d }} min
        </button>
      </div>
    </div>

    <p v-if="!progress" class="muted">Chargement…</p>
    <div v-else-if="!hasData" class="empty">
      <Mountain :size="26" aria-hidden="true" />
      <p>Ta meilleure VAM sur 5, 10, 20 et 30 min apparaîtra ici dès ta première sortie avec une vraie montée (plus de 300 m/h).</p>
    </div>

    <template v-else>
      <p class="small text-2">Meilleure vitesse ascensionnelle tenue {{ duration }} min, chaque semaine. Indépendante du parcours : c’est elle qui montre si tu progresses en côte.</p>

      <div class="figures">
        <RouterLink v-if="record" :to="`/activites/${record.activityId}`" class="figure">
          <span class="eyebrow"><Trophy :size="14" aria-hidden="true" /> Record {{ duration }} min</span>
          <strong>{{ formatNumber(record.vam) }} <span class="unit">m/h</span></strong>
          <small class="muted">{{ formatLongDate(record.date) }} · {{ record.activityName }}</small>
        </RouterLink>
        <div v-else class="figure">
          <span class="eyebrow"><Trophy :size="14" aria-hidden="true" /> Record {{ duration }} min</span>
          <strong class="muted">—</strong>
          <small class="muted">Aucune montée tenue {{ duration }} min pour l’instant.</small>
        </div>
        <div class="figure">
          <span class="eyebrow">4 dernières semaines</span>
          <strong v-if="trend?.recent">{{ formatNumber(trend.recent) }} <span class="unit">m/h</span></strong>
          <strong v-else class="muted">—</strong>
          <small v-if="trend?.deltaPct !== undefined" class="delta" :class="{ up: trend.deltaPct > 0, down: trend.deltaPct < 0 }">
            <component :is="trend.deltaPct >= 0 ? TrendingUp : TrendingDown" :size="14" aria-hidden="true" />
            {{ trend.deltaPct > 0 ? '+' : '' }}{{ formatNumber(trend.deltaPct, 1) }} % face aux 8 semaines d’avant
          </small>
          <small v-else class="muted">{{ trend?.recent ? 'Pas de référence sur les 8 semaines d’avant.' : 'Pas de montée récente sur cette durée.' }}</small>
        </div>
      </div>

      <div ref="container" class="chart">
        <svg
          :viewBox="`0 0 ${width} ${HEIGHT}`"
          :height="HEIGHT"
          role="img"
          :aria-label="ariaLabel"
          :class="{ clickable: hover?.mark }"
          @pointermove="onMove"
          @pointerleave="hover = undefined"
          @click="open"
        >
          <rect v-if="recentBand" class="recent" :x="recentBand.x" :y="PAD.top" :width="recentBand.width" :height="HEIGHT - PAD.top - PAD.bottom" />
          <text v-if="recentBand" class="band-label" :x="recentBand.x + recentBand.width - 4" :y="PAD.top + 12" text-anchor="end">4 dern. sem.</text>
          <g class="grid">
            <line v-for="t in scale.ticks" :key="t" :x1="PAD.left" :x2="width - PAD.right" :y1="scale.y(t)" :y2="scale.y(t)" />
          </g>
          <g class="axis">
            <text v-for="t in scale.ticks" :key="`y${t}`" :x="PAD.left - 8" :y="scale.y(t)" text-anchor="end" dominant-baseline="middle">{{ formatNumber(t) }}</text>
            <text v-for="m in monthTicks" :key="`m${m.i}`" :x="scale.x(m.i)" :y="HEIGHT - 8" text-anchor="middle">{{ m.label }}</text>
          </g>
          <g v-if="record">
            <line class="record" :x1="PAD.left" :x2="width - PAD.right" :y1="scale.y(record.vam)" :y2="scale.y(record.vam)" />
            <text class="record-label" :x="PAD.left + 6" :y="scale.y(record.vam) - 6">record {{ formatNumber(record.vam) }} m/h</text>
          </g>
          <path :d="segments" class="line" />
          <circle
            v-for="p in points.filter((q) => q.mark)"
            :key="p.weekStart"
            class="dot"
            :class="{ best: p.mark!.activityId === record?.activityId && p.mark!.vam === record?.vam, active: hover?.weekStart === p.weekStart }"
            :cx="scale.x(p.i)"
            :cy="scale.y(p.mark!.vam)"
            :r="hover?.weekStart === p.weekStart ? 6 : 4.5"
          />
        </svg>
        <div v-if="hover?.mark" class="tooltip" :style="tooltipStyle" role="presentation">
          <span class="muted">Semaine du {{ formatWeekRange(hover.weekStart) }}</span>
          <strong class="num">{{ formatNumber(hover.mark.vam) }} m/h</strong>
          <span>{{ hover.mark.activityName }}</span>
        </div>
      </div>

      <div class="visually-hidden">
        <table>
          <caption>Meilleure VAM sur {{ duration }} min par semaine</caption>
          <thead><tr><th>Semaine</th><th>VAM (m/h)</th><th>Sortie</th></tr></thead>
          <tbody>
            <tr v-for="p in points.filter((q) => q.mark)" :key="p.weekStart">
              <td>{{ p.weekStart }}</td><td>{{ p.mark!.vam }}</td><td>{{ p.mark!.activityName }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.card-title {
  flex-wrap: wrap;
  gap: var(--space-2);
}
.card-title h2 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.durations {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.figures {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: var(--space-3);
  margin: var(--space-3) 0;
}
.figure {
  display: grid;
  gap: 2px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: inherit;
  text-decoration: none;
}
a.figure:hover {
  outline: 1px solid var(--accent);
}
.figure .eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.figure strong {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 600;
}
.unit {
  font-size: 0.9rem;
  color: var(--text-2);
  font-weight: 500;
}
.delta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
}
.delta.up svg {
  color: var(--success);
}
.delta.down svg {
  color: var(--warning);
}
.chart {
  position: relative;
  width: 100%;
}
.chart svg {
  width: 100%;
  display: block;
  touch-action: pan-y;
}
.chart svg.clickable {
  cursor: pointer;
}
.recent {
  fill: var(--teal);
  opacity: 0.06;
}
.band-label {
  fill: var(--muted);
  font-size: 11px;
}
.grid line {
  stroke: var(--border);
  stroke-width: 1;
}
.axis text {
  fill: var(--muted);
  font-size: 11px;
  font-family: var(--font-mono);
}
.record {
  stroke: var(--text-2);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}
.record-label {
  fill: var(--text-2);
  font-size: 11px;
  font-weight: 600;
}
.line {
  fill: none;
  stroke: var(--teal);
  stroke-width: 2;
  stroke-linecap: round;
}
.dot {
  fill: var(--teal);
  stroke: var(--surface);
  stroke-width: 2;
  transition: r 0.12s var(--ease);
}
.dot.best {
  fill: var(--warning);
}
.tooltip {
  position: absolute;
  pointer-events: none;
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
  font-size: 0.8rem;
  white-space: nowrap;
  z-index: 2;
}
.empty {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: var(--space-5) var(--space-4);
  text-align: center;
  color: var(--text-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
}
.empty p {
  margin: 0;
  max-width: 46ch;
}
</style>
