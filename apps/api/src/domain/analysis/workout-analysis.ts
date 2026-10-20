import { activityDay, type Activity, type ActivitySample } from '../activity/activity'
import type { AthleteProfile } from '../athlete/athlete-profile'
import type { PlannedSession, SessionType, Zone } from '../plan/training-plan'
import { kmEffort } from '../goal/race-goal'
import { addDays, daysBetween, weekday } from '../shared/dates'
import { formatInt, formatKm, formatMinutes, formatPercent, weekdayName } from '../shared/format'
import { mean, median } from '../shared/math'
import { activityLoad, expectedActivityLoad } from '../training-load/training-load'
import { aggregateVerticalSpeed, detectClimbs, movingSeconds, type Climb } from './climbs'
import { vamCurve, vamRecords, type VamCurve, type VamDuration } from './vam-curve'
import { heartRateZones, shareAtOrAbove, timeInZones, totalSeconds, type HeartRateZones, type TimeInZones } from './heart-rate-zones'

export type Verdict = 'ON_TARGET' | 'TOO_HARD' | 'TOO_EASY' | 'CUT_SHORT' | 'EXTENDED' | 'UNPLANNED'
export type InsightTone = 'POSITIVE' | 'ATTENTION' | 'INFO'
export type InsightTopic = 'INTENSITY' | 'DURATION' | 'ELEVATION' | 'UPHILL' | 'DOWNHILL' | 'ENDURANCE' | 'NUTRITION' | 'DATA' | 'LOAD'

export interface Insight {
  tone: InsightTone
  topic: InsightTopic
  title: string
  text: string
}

export interface PlanComparison {
  sessionId: string
  sessionTitle: string
  sessionType: SessionType
  keySession: boolean
  targetZone: Zone
  plannedDurationMin: number
  actualDurationMin: number
  plannedDistanceKm?: number
  plannedElevationM?: number
  /** Temps d'effort prévu (blocs « effort » des séances de qualité) et temps réellement passé dans la zone visée. */
  plannedEffortMin?: number
  effortMin?: number
}

export interface WorkoutAnalysis {
  activityId: string
  hasDetail: boolean
  zones?: HeartRateZones & { seconds: TimeInZones }
  climbs: Climb[]
  descents: Climb[]
  /** VAM moyenne sur l'ensemble des montées, et meilleure montée d'au moins 100 m. */
  ascentVam?: number
  bestClimb?: Climb
  descentSpeed?: number
  /** Médiane des meilleures VAM des 8 semaines précédentes (au moins 3 sorties). */
  vamBaseline?: number
  /** Meilleures VAM tenues 5, 10, 20 et 30 min sur cette sortie. */
  vamCurve: VamCurve
  /** Records personnels battus, avec l'ancienne meilleure valeur. */
  vamRecords: Array<{ minutes: VamDuration; vam: number; previous: number }>
  /** Perte d'efficience (allure-effort / FC) entre la 1re et la 2e moitié, en %. */
  decouplingPct?: number
  load: number
  plannedLoad?: number
  /** FC max du profil dépassée (ou absente) : valeur observée à proposer, sur 10 s pour écarter les pics du capteur. */
  hrMaxSuggestion?: { observed: number; current?: number }
  comparison?: PlanComparison
  verdict: Verdict
  /** Note de conformité au plan, sur 100. */
  score?: number
  headline: string
  insights: Insight[]
  nextStep?: { text: string; sessionId?: string; suggestLighten: boolean }
}

export interface AnalysisContext {
  profile: Pick<AthleteProfile, 'hrMax' | 'hrRest'>
  session?: PlannedSession
  /** Séances du plan, pour conseiller la suite. */
  sessions: PlannedSession[]
  /** Activités antérieures, pour situer la VAM du jour. */
  history: Activity[]
}

/** Séances d'endurance : l'important est de ne pas dépasser la zone visée. */
const EASY_TYPES: ReadonlySet<SessionType> = new Set([
  'ENDURANCE',
  'RECOVERY',
  'LONG_RUN',
  'BACK_TO_BACK',
  'HIKE_RUN',
  'DOWNHILL',
  'BIKE_ENDURANCE',
])
/** Séances de qualité : l'important est d'atteindre la zone visée assez longtemps. */
const QUALITY_TYPES: ReadonlySet<SessionType> = new Set(['HILL_REPEATS', 'UPHILL_THRESHOLD', 'FARTLEK', 'BIKE_STRENGTH', 'SIMULATION'])

const MIN_BEST_CLIMB_M = 100
const BASELINE_WEEKS = 8
const MIN_HR_COVERAGE = 0.7

export function analyzeWorkout(activity: Activity, context: AnalysisContext): WorkoutAnalysis {
  const samples = activity.samples ?? []
  const hasDetail = samples.length >= 2
  const zonesDef = heartRateZones(context.profile)
  const hrCoverage = hasDetail ? samples.filter((s) => s.hr !== undefined).length / samples.length : 0
  const zones = zonesDef && hrCoverage >= MIN_HR_COVERAGE ? { ...zonesDef, seconds: timeInZones(samples, zonesDef) } : undefined

  const { climbs, descents } = hasDetail ? detectClimbs(samples) : { climbs: [], descents: [] }
  const bestClimb = bestClimbOf(climbs)
  const vamBaseline = baselineVam(activity, context.history)
  const decouplingPct = hrCoverage >= MIN_HR_COVERAGE ? decoupling(samples) : undefined

  const session = context.session
  const comparison = session ? compare(activity, session, zones?.seconds) : undefined
  const load = activityLoad(activity, context.profile)
  const verdict = comparison ? judge(comparison, zones?.seconds) : 'UNPLANNED'

  const analysis: WorkoutAnalysis = {
    activityId: activity.id,
    hasDetail,
    zones,
    climbs,
    descents,
    ascentVam: aggregateVerticalSpeed(climbs),
    bestClimb,
    descentSpeed: aggregateVerticalSpeed(descents),
    vamBaseline,
    vamCurve: hasDetail && activity.sport === 'RUN' ? vamCurve(samples) : {},
    vamRecords: vamRecords(activity, context.history).map(({ effort, previous }) => ({ minutes: effort.minutes, vam: effort.vam, previous })),
    decouplingPct,
    load,
    plannedLoad: session ? expectedActivityLoad(session, Boolean(activity.avgHeartRate && context.profile.hrMax && context.profile.hrRest)) : undefined,
    hrMaxSuggestion: hrMaxSuggestion(activity, context),
    comparison,
    verdict,
    score: comparison ? score(comparison, verdict) : undefined,
    headline: '',
    insights: [],
  }
  analysis.headline = headline(activity, analysis)
  analysis.insights = insights(activity, analysis, context)
  analysis.nextStep = nextStep(activity, analysis, context.sessions)
  return analysis
}

/** Au-delà, c'est une erreur du capteur, pas une FC. */
const MAX_PLAUSIBLE_HR = 225
/** Sans trace, la FC max annoncée par la montre est un point isolé : on exige un net dépassement. */
const SUMMARY_HR_MARGIN = 3

function observedMaxHeartRate(activity: Activity): number | undefined {
  const fromSamples = activity.samples?.flatMap((s) => (s.hr === undefined ? [] : [s.hr])) ?? []
  const max = fromSamples.length ? Math.max(...fromSamples) : activity.maxHeartRate ? activity.maxHeartRate - SUMMARY_HR_MARGIN : undefined
  return max && max <= MAX_PLAUSIBLE_HR ? max : undefined
}

function hrMaxSuggestion(activity: Activity, context: AnalysisContext): WorkoutAnalysis['hrMaxSuggestion'] {
  const current = context.profile.hrMax
  if (current) {
    const observed = observedMaxHeartRate(activity)
    return observed && observed > current ? { observed, current } : undefined
  }
  const observed = Math.max(0, ...[activity, ...context.history].map((a) => observedMaxHeartRate(a) ?? 0))
  return observed > 0 ? { observed } : undefined
}

function bestClimbOf(climbs: Climb[]): Climb | undefined {
  return climbs.filter((c) => c.elevationM >= MIN_BEST_CLIMB_M).sort((a, b) => b.verticalSpeed - a.verticalSpeed)[0]
}

function baselineVam(activity: Activity, history: Activity[]): number | undefined {
  const until = activity.startTime
  const since = new Date(Date.parse(until) - BASELINE_WEEKS * 7 * 86_400_000).toISOString()
  const values = history
    .filter((a) => a.id !== activity.id && a.sport === activity.sport && a.startTime < until && a.startTime >= since && a.samples?.length)
    .flatMap((a) => {
      const best = bestClimbOf(detectClimbs(a.samples!).climbs)
      return best ? [best.verticalSpeed] : []
    })
  return values.length < 3 ? undefined : Math.round(median(values)!)
}

/**
 * Découplage aérobie : on compare l'efficience (km-effort par heure, rapportés à la FC)
 * de la première et de la seconde moitié du temps en mouvement, échauffement exclu
 * (la FC y monte encore). Au-delà de 5 %, l'endurance de base ou l'hydratation / l'alimentation
 * ont lâché. Pas de verdict si les deux moitiés n'ont pas un terrain comparable.
 */
const WARM_UP_SEC = 600
const MAX_TERRAIN_GAP_M_PER_KM = 15

function decoupling(samples: ActivitySample[]): number | undefined {
  const steady = samples.filter((s) => s.t >= WARM_UP_SEC)
  if (steady.length < 2 || steady.at(-1)!.t - steady[0]!.t < 50 * 60) return undefined
  const middleTime = (steady[0]!.t + steady.at(-1)!.t) / 2
  const middle = steady.findIndex((s) => s.t >= middleTime)
  const halves = [steady.slice(0, middle + 1), steady.slice(middle)].map((part) => {
    let gain = 0
    let loss = 0
    for (let i = 1; i < part.length; i++) {
      const delta = (part[i]!.alt ?? 0) - (part[i - 1]!.alt ?? 0)
      if (delta > 0) gain += delta
      else loss -= delta
    }
    const km = part.at(-1)!.d - part[0]!.d
    const effortKm = kmEffort(km, gain)
    const hr = mean(part.flatMap((s) => (s.hr === undefined ? [] : [s.hr])))
    const seconds = movingSeconds(part)
    return {
      gainPerKm: km > 0 ? gain / km : 0,
      lossPerKm: km > 0 ? loss / km : 0,
      efficiency: seconds < 600 || hr === undefined || effortKm <= 0 ? undefined : effortKm / (seconds / 3600) / hr,
    }
  })
  const [first, second] = halves as [(typeof halves)[0], (typeof halves)[0]]
  if (
    Math.abs(first.gainPerKm - second.gainPerKm) > MAX_TERRAIN_GAP_M_PER_KM ||
    Math.abs(first.lossPerKm - second.lossPerKm) > MAX_TERRAIN_GAP_M_PER_KM ||
    first.efficiency === undefined ||
    second.efficiency === undefined
  ) {
    return undefined
  }
  return Math.round(((first.efficiency - second.efficiency) / first.efficiency) * 1000) / 10
}

function effortMinutesOf(session: PlannedSession): number {
  return session.steps.filter((s) => s.kind === 'EFFORT').reduce((sum, s) => sum + s.durationMin * (s.repeat ?? 1), 0)
}

/** Zone à partir de laquelle on compte le temps d'effort : la FC met 1 à 2 min à monter sur les efforts courts. */
function effortZone(session: PlannedSession): Zone {
  return (session.type === 'HILL_REPEATS' || session.zone === 5 ? Math.max(session.zone - 1, 1) : session.zone) as Zone
}

function compare(activity: Activity, session: PlannedSession, zones?: TimeInZones): PlanComparison {
  const plannedEffortMin = QUALITY_TYPES.has(session.type) ? effortMinutesOf(session) : undefined
  return {
    sessionId: session.id,
    sessionTitle: session.title,
    sessionType: session.type,
    keySession: session.keySession,
    targetZone: session.zone,
    plannedDurationMin: session.durationMin,
    actualDurationMin: Math.round(activity.durationSec / 60),
    plannedDistanceKm: session.distanceKm,
    plannedElevationM: session.elevationGainM,
    plannedEffortMin: plannedEffortMin || undefined,
    effortMin: plannedEffortMin && zones ? Math.round((shareAtOrAbove(zones, effortZone(session)) * totalSeconds(zones)) / 60) : undefined,
  }
}

/** Trop intense pour une séance facile : plus de 10 % deux zones au-dessus, ou 40 % une zone au-dessus. */
function tooIntense(comparison: PlanComparison, zones: TimeInZones): boolean {
  const target = comparison.targetZone
  if (comparison.sessionType === 'RECOVERY') return shareAtOrAbove(zones, 3) > 0.1
  return shareAtOrAbove(zones, target + 2) > 0.1 || shareAtOrAbove(zones, target + 1) > 0.4
}

/** Séance de qualité appuyée bien au-delà des blocs prévus : plus de deux fois et 15 min de plus. */
function overdone(comparison: PlanComparison): boolean {
  const planned = comparison.plannedEffortMin ?? 0
  return comparison.effortMin !== undefined && planned > 0 && comparison.effortMin > Math.max(planned * 2, planned + 15)
}

function judge(comparison: PlanComparison, zones?: TimeInZones): Verdict {
  if (zones && EASY_TYPES.has(comparison.sessionType) && tooIntense(comparison, zones)) return 'TOO_HARD'
  if (comparison.plannedEffortMin && comparison.effortMin !== undefined) {
    const expected = comparison.sessionType === 'HILL_REPEATS' ? 0.35 : 0.5
    if (comparison.plannedEffortMin >= 8 && comparison.effortMin < comparison.plannedEffortMin * expected) return 'TOO_EASY'
    if (overdone(comparison)) return 'TOO_HARD'
  }
  const ratio = comparison.actualDurationMin / comparison.plannedDurationMin
  if (ratio < 0.75) return 'CUT_SHORT'
  if (ratio > 1.3) return 'EXTENDED'
  return 'ON_TARGET'
}

function score(comparison: PlanComparison, verdict: Verdict): number {
  const durationGap = Math.abs(1 - comparison.actualDurationMin / comparison.plannedDurationMin)
  let penalty = Math.min(durationGap * 60, 35)
  if (verdict === 'TOO_HARD' || verdict === 'TOO_EASY') penalty += 30
  return Math.max(0, Math.round(100 - penalty))
}

function headline(activity: Activity, a: WorkoutAnalysis): string {
  const c = a.comparison
  const summary = `${formatMinutes(activity.durationSec / 60)}, ${formatKm(activity.distanceKm)}${activity.elevationGainM >= 50 ? `, ${formatInt(activity.elevationGainM)} m D+` : ''}`
  if (!c) return `Sortie libre : ${summary}.`
  switch (a.verdict) {
    case 'TOO_HARD':
      return overdone(c)
        ? `Plus intense que prévu : ${c.effortMin} min en zone d’effort pour ${c.plannedEffortMin} prévues.`
        : `Plus intense que prévu : ${formatPercent(shareAtOrAbove(a.zones!.seconds, c.targetZone + 1))} du temps au-dessus de Z${c.targetZone}.`
    case 'TOO_EASY':
      return `Intensité en deçà : ${c.effortMin} min en zone d’effort sur ${c.plannedEffortMin} prévues.`
    case 'CUT_SHORT':
      return `Séance écourtée : ${formatMinutes(c.actualDurationMin)} sur ${formatMinutes(c.plannedDurationMin)} prévues.`
    case 'EXTENDED':
      return `Plus long que prévu : ${formatMinutes(c.actualDurationMin)} au lieu de ${formatMinutes(c.plannedDurationMin)}.`
    default:
      return `Séance réussie : « ${c.sessionTitle} » réalisée comme prévu (${summary}).`
  }
}

function insights(activity: Activity, a: WorkoutAnalysis, context: AnalysisContext): Insight[] {
  const c = a.comparison
  return [
    a.zones && intensityInsight(a, a.zones.seconds),
    ...(c ? planInsights(activity, a, c) : []),
    vamRecordsInsight(a),
    climbsInsight(a),
    descentsInsight(activity, a),
    enduranceInsight(activity, a),
    fuelInsight(activity),
    loadInsight(a),
    dataInsight(activity, a, context),
  ].filter((i): i is Insight => Boolean(i))
}

function intensityInsight(a: WorkoutAnalysis, zones: TimeInZones): Insight | undefined {
  const c = a.comparison
  const easy = 1 - shareAtOrAbove(zones, 3)
  if (a.verdict === 'TOO_HARD' && overdone(c!)) {
    return {
      tone: 'ATTENTION',
      topic: 'INTENSITY',
      title: 'Séance trop appuyée',
      text: `${c!.effortMin} min en zone d’effort pour ${c!.plannedEffortMin} prévues. Une séance de qualité vaut par la précision des blocs, pas par leur durée : entre eux, récupère vraiment en Z1-Z2.`,
    }
  }
  if (a.verdict === 'TOO_HARD') {
    return {
      tone: 'ATTENTION',
      topic: 'INTENSITY',
      title: 'Trop vite pour une séance facile',
      text: `Seulement ${formatPercent(easy)} du temps en Z1-Z2. En montée, passe à la marche active dès que tu ne peux plus parler : l’endurance se construit en aisance, et tu arriveras plus frais à la prochaine séance clé.`,
    }
  }
  if (a.verdict === 'TOO_EASY') {
    return {
      tone: 'ATTENTION',
      topic: 'INTENSITY',
      title: 'Zone d’effort pas atteinte',
      text: `${c!.effortMin} min en zone d’effort pour ${c!.plannedEffortMin} prévues. Si les jambes étaient lourdes, c’était le bon choix ; sinon, ose pousser un peu plus sur les blocs et récupère vraiment entre eux.`,
    }
  }
  if (c && EASY_TYPES.has(c.sessionType)) {
    return { tone: 'POSITIVE', topic: 'INTENSITY', title: 'Intensité maîtrisée', text: `${formatPercent(easy)} du temps en Z1-Z2 : exactement ce qu’on attend d’une séance d’endurance.` }
  }
  if (c?.plannedEffortMin && c.effortMin !== undefined) {
    return { tone: 'POSITIVE', topic: 'INTENSITY', title: 'Blocs d’effort réussis', text: `${c.effortMin} min en zone d’effort pour ${c.plannedEffortMin} prévues.` }
  }
  if (!c) {
    return {
      tone: 'INFO',
      topic: 'INTENSITY',
      title: 'Répartition de l’effort',
      text: `${formatPercent(easy)} en Z1-Z2, ${formatPercent(shareAtOrAbove(zones, 4))} en Z4-Z5.`,
    }
  }
  return undefined
}

/** Durée et dénivelé réalisés face à la séance prévue. */
function planInsights(activity: Activity, a: WorkoutAnalysis, c: PlanComparison): Insight[] {
  const list: Insight[] = []
  const ratio = c.actualDurationMin / c.plannedDurationMin
  if (a.verdict === 'CUT_SHORT') {
    list.push({
      tone: 'ATTENTION',
      topic: 'DURATION',
      title: 'Séance raccourcie',
      text: `${formatPercent(ratio)} de la durée prévue. Pas de rattrapage : reprends le plan normalement, c’est la régularité qui paie.`,
    })
  } else if (a.verdict === 'EXTENDED') {
    list.push({
      tone: 'ATTENTION',
      topic: 'DURATION',
      title: 'Plus long que prévu',
      text: `${formatPercent(ratio)} de la durée prévue : le surplus de volume se paie en fatigue, veille à bien récupérer.`,
    })
  }
  if (c.plannedElevationM && c.plannedElevationM >= 200 && activity.sport === 'RUN') {
    const elevationRatio = activity.elevationGainM / c.plannedElevationM
    if (elevationRatio < 0.7) {
      list.push({
        tone: 'INFO',
        topic: 'ELEVATION',
        title: 'D+ en dessous de l’objectif',
        text: `${formatInt(activity.elevationGainM)} m sur ${formatInt(c.plannedElevationM)} m prévus. Si le terrain manque, des répétitions de côte, des escaliers ou le tapis incliné complètent bien.`,
      })
    } else if (elevationRatio >= 0.9) {
      list.push({ tone: 'POSITIVE', topic: 'ELEVATION', title: 'D+ au rendez-vous', text: `${formatInt(activity.elevationGainM)} m de dénivelé pour ${formatInt(c.plannedElevationM)} m prévus.` })
    }
  }
  return list
}

function vamRecordsInsight(a: WorkoutAnalysis): Insight | undefined {
  const [first, ...others] = a.vamRecords
  if (!first) return undefined
  return {
    tone: 'POSITIVE',
    topic: 'UPHILL',
    title: others.length ? 'Records de VAM' : 'Record de VAM',
    text:
      `Nouveau record sur ${first.minutes} min : ${formatInt(first.vam)} m/h (précédent : ${formatInt(first.previous)} m/h).` +
      (others.length ? ` Aussi sur ${others.map((r) => `${r.minutes} min (${formatInt(r.vam)} m/h)`).join(', ')}.` : ''),
  }
}

function climbsInsight(a: WorkoutAnalysis): Insight | undefined {
  if (!a.climbs.length || !a.ascentVam) return undefined
  const best = a.bestClimb
  let text = `${a.climbs.length} montée${a.climbs.length > 1 ? 's' : ''} de plus de 50 m, à ${formatInt(a.ascentVam)} m/h en moyenne.`
  if (best) text += ` Meilleure : ${formatInt(best.verticalSpeed)} m/h sur ${formatInt(best.elevationM)} m à ${best.gradePct.toLocaleString('fr-FR')} % (km ${best.startKm.toLocaleString('fr-FR')}).`
  let tone: InsightTone = 'INFO'
  if (best && a.vamBaseline) {
    const delta = best.verticalSpeed / a.vamBaseline - 1
    if (delta >= 0.05) {
      tone = 'POSITIVE'
      text += ` C’est ${formatPercent(delta)} de mieux que ta VAM habituelle (${formatInt(a.vamBaseline)} m/h).`
    } else if (delta <= -0.1) {
      text += ` En dessous de ta VAM habituelle (${formatInt(a.vamBaseline)} m/h) : normal sur une séance facile ou en fin de bloc chargé.`
    } else {
      text += ` Dans tes valeurs habituelles (${formatInt(a.vamBaseline)} m/h).`
    }
  }
  return { tone, topic: 'UPHILL', title: 'Montées', text }
}

function descentsInsight(activity: Activity, a: WorkoutAnalysis): Insight | undefined {
  const descended = a.descents.reduce((s, d) => s - d.elevationM, 0)
  if (descended < 200 || !a.descentSpeed || activity.sport !== 'RUN') return undefined
  return {
    tone: 'INFO',
    topic: 'DOWNHILL',
    title: 'Descentes',
    text: `${formatInt(descended)} m descendus à ${formatInt(a.descentSpeed)} m/h.${descended >= 400 ? ' Ce volume de descente use les quadriceps : l’excentrique du renfo te prépare à l’encaisser.' : ''}`,
  }
}

function enduranceInsight(activity: Activity, a: WorkoutAnalysis): Insight | undefined {
  const c = a.comparison
  if (a.decouplingPct === undefined || (c && !EASY_TYPES.has(c.sessionType))) return undefined
  if (a.decouplingPct >= 8) {
    return {
      tone: 'ATTENTION',
      topic: 'ENDURANCE',
      title: 'Dérive cardiaque',
      text: `Ton efficience a baissé de ${formatInt(a.decouplingPct)} % en seconde moitié : à effort égal, la FC monte. Chaleur, hydratation ou carburant insuffisants, ou fatigue accumulée : bois et mange dès la première heure.`,
    }
  }
  if (a.decouplingPct <= 4 && activity.durationSec / 60 >= 75) {
    return {
      tone: 'POSITIVE',
      topic: 'ENDURANCE',
      title: 'Endurance solide',
      text: `FC stable du début à la fin (dérive de ${formatInt(Math.max(a.decouplingPct, 0))} %) : ta base aérobie encaisse bien la durée.`,
    }
  }
  return undefined
}

function fuelInsight(activity: Activity): Insight | undefined {
  const minutes = activity.durationSec / 60
  if (minutes < 120 || activity.sport === 'STRENGTH') return undefined
  const hours = minutes / 60
  return {
    tone: 'INFO',
    topic: 'NUTRITION',
    title: 'Carburant',
    text: `Sur ${formatMinutes(minutes)}, vise 60 à 90 g de glucides par heure, soit ${formatInt(hours * 60)} à ${formatInt(hours * 90)} g, et 500 à 700 mg de sodium par litre bu. Les sorties longues servent aussi à entraîner l’estomac.`,
  }
}

function loadInsight(a: WorkoutAnalysis): Insight | undefined {
  if (!a.plannedLoad || a.load <= a.plannedLoad * 1.4) return undefined
  return {
    tone: 'ATTENTION',
    topic: 'LOAD',
    title: 'Charge élevée',
    text: `Charge de ${a.load} pour ${a.plannedLoad} prévue : cette séance compte presque double dans ta fatigue.`,
  }
}

function dataInsight(activity: Activity, a: WorkoutAnalysis, context: AnalysisContext): Insight | undefined {
  if (!a.hasDetail) {
    return { tone: 'INFO', topic: 'DATA', title: 'Analyse partielle', text: 'La trace détaillée n’est pas (encore) disponible : zones cardiaques et montées seront analysées dès sa récupération.' }
  }
  if (a.hrMaxSuggestion?.current) {
    return {
      tone: 'ATTENTION',
      topic: 'DATA',
      title: 'FC max dépassée',
      text: `${a.hrMaxSuggestion.observed} bpm tenus 10 s, au-dessus des ${a.hrMaxSuggestion.current} bpm de ton profil. Mets ta FC max à jour : toutes tes zones, et donc tes analyses, seront plus justes.`,
    }
  }
  if (!context.profile.hrMax && activity.avgHeartRate) {
    return {
      tone: 'INFO',
      topic: 'DATA',
      title: 'Zones cardiaques',
      text: `Renseigne ta FC max (et ta FC de repos) pour obtenir le temps passé dans chaque zone.${a.hrMaxSuggestion ? ` La plus haute FC relevée sur tes sorties est ${a.hrMaxSuggestion.observed} bpm : c’est au moins ta FC max.` : ''}`,
    }
  }
  return undefined
}

function nextStep(activity: Activity, a: WorkoutAnalysis, sessions: PlannedSession[]): WorkoutAnalysis['nextStep'] {
  const day = activityDay(activity)
  const next = sessions
    .filter((s) => s.date > day && s.status === 'PLANNED' && s.sport !== 'STRENGTH')
    .sort((x, y) => x.date.localeCompare(y.date))[0]
  if (!next) return undefined
  const when = daysBetween(day, next.date) === 1 ? 'demain' : weekdayName(weekday(next.date))
  const heavy = a.verdict === 'TOO_HARD' || a.verdict === 'EXTENDED' || (a.plannedLoad !== undefined && a.load > a.plannedLoad * 1.4)
  if (heavy && next.keySession && next.date <= addDays(day, 2)) {
    return {
      text: `La séance clé « ${next.title} » arrive ${when} : si les jambes sont lourdes au réveil, allège-la plutôt que de la rater.`,
      sessionId: next.id,
      suggestLighten: true,
    }
  }
  if (heavy) return { text: `Prochaine séance ${when} : « ${next.title} ». Reste bien dans la zone prévue pour assimiler.`, sessionId: next.id, suggestLighten: false }
  return { text: `Prochaine séance ${when} : « ${next.title} » (${formatMinutes(next.durationMin)}).`, sessionId: next.id, suggestLighten: false }
}
