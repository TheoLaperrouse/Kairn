import type { ExperienceLevel } from '../athlete/athlete-profile'
import { estimateRaceDurationH, type RaceGoal } from '../goal/race-goal'
import { computeFuelingPlan, type GutTraining, type SweatProfile } from '../nutrition/race-fueling'
import { downsampleProfile, haversineKm } from '../activity/activity'
import { assertDomain } from '../shared/errors'
import { clamp, round1, round2, roundTo } from '../shared/math'

/**
 * Parcours officiel de la course (GPX de l'organisation) et plan de course qui en découle :
 * découpage montées/descentes, temps de passage aux ravitos, marges sur les barrières horaires
 * et ravitaillement à emporter entre chaque point.
 */

export interface CoursePoint {
  distanceKm: number
  altitudeM: number
}

export interface AidStation {
  name: string
  km: number
  /** Barrière horaire en heures depuis le départ. */
  cutoffH?: number
  /** Base de vie / ravito complet (arrêt plus long, sac d'allègement). */
  major: boolean
}

export interface RaceCourseSettings {
  /** Heure de départ locale, `HH:MM`. */
  startTime: string
  temperatureC: number
  sweat: SweatProfile
  gut: GutTraining
  weightKg: number
}

export interface RaceCourse {
  name: string
  uploadedAt: string
  points: CoursePoint[]
  totalDistanceKm: number
  elevationGainM: number
  elevationLossM: number
  maxAltitudeM: number
  aidStations: AidStation[]
  settings: RaceCourseSettings
}

export type SegmentKind = 'MONTEE' | 'DESCENTE' | 'ROULANT'

export interface CourseSegment {
  kind: SegmentKind
  startKm: number
  endKm: number
  gainM: number
  lossM: number
  avgGradePct: number
  startElapsedH: number
  durationH: number
}

export interface LegNutrition {
  carbsG: number
  fluidMl: number
  sodiumMg: number
  carry: string[]
}

export interface Split {
  name: string
  km: number
  elapsedH: number
  /** Heure locale d'arrivée, `HH:MM`, et numéro du jour (0 = jour du départ). */
  clock: string
  day: number
  cutoffH?: number
  marginH?: number
  legDistanceKm: number
  legGainM: number
  legLossM: number
  legDurationH: number
  stopMin: number
  night: boolean
  nutrition: LegNutrition
}

export interface RacePlan {
  totalH: number
  movingH: number
  segments: CourseSegment[]
  splits: Split[]
  /** Temps prévu à chaque point du profil (pour le survol du graphique). */
  timeline: Array<{ km: number; elapsedH: number }>
  warnings: string[]
}

export interface TrackPoint {
  lat: number
  lon: number
  ele: number
}

/** Construit le profil (distance cumulée, altitude lissée) à partir des points GPS. */
export function buildProfile(track: TrackPoint[]): CoursePoint[] {
  assertDomain(track.length >= 10, 'Le tracé contient trop peu de points')
  let distance = 0
  const raw = track.map((p, i) => {
    const prev = track[i - 1]
    if (prev) distance += haversineKm(prev.lat, prev.lon, p.lat, p.lon)
    return { distanceKm: distance, altitudeM: p.ele }
  })
  // Lissage glissant sur ~150 m pour gommer le bruit d'altitude des traces.
  const smoothed = raw.map((p, i) => {
    const window = raw.filter((q, j) => Math.abs(j - i) <= 20 && Math.abs(q.distanceKm - p.distanceKm) <= 0.075)
    return { distanceKm: p.distanceKm, altitudeM: window.reduce((s, q) => s + q.altitudeM, 0) / window.length }
  })
  return downsampleProfile(smoothed, 1500).map((p) => ({
    distanceKm: Math.round(p.distanceKm * 1000) / 1000,
    altitudeM: Math.round(p.altitudeM),
  }))
}

/** Kilomètre du tracé le plus proche d'un waypoint (ravitaillement indiqué dans le GPX). */
export function snapToTrack(track: TrackPoint[], target: { lat: number; lon: number }): number {
  let best = { km: 0, gap: Infinity }
  let distance = 0
  track.forEach((p, i) => {
    const prev = track[i - 1]
    if (prev) distance += haversineKm(prev.lat, prev.lon, p.lat, p.lon)
    const gap = haversineKm(p.lat, p.lon, target.lat, target.lon)
    if (gap < best.gap) best = { km: distance, gap }
  })
  return round1(best.km)
}

export function courseStats(points: CoursePoint[]): Pick<RaceCourse, 'totalDistanceKm' | 'elevationGainM' | 'elevationLossM' | 'maxAltitudeM'> {
  const { gain, loss } = legStats(points, -Infinity, Infinity)
  return {
    totalDistanceKm: round1(points.at(-1)?.distanceKm ?? 0),
    elevationGainM: gain,
    elevationLossM: loss,
    maxAltitudeM: Math.max(...points.map((p) => p.altitudeM)),
  }
}

/** Coût relatif d'un mètre de descente selon la technicité (plus c'est technique, plus ça coûte). */
const DESCENT_DIVISOR = [400, 320, 250, 180, 130] as const
/** Ralentissement progressif : +25 % de coût à l'arrivée par rapport au départ. */
const FATIGUE_DRIFT = 0.25
const NIGHT_START_MIN = 21 * 60
const NIGHT_END_MIN = 6 * 60 + 30
/** Seuils de détection des montées/descentes. */
const HYSTERESIS_M = 40
const FLAT_GRADE_PCT = 3

export function planRace(course: RaceCourse, goal: RaceGoal, level: ExperienceLevel): RacePlan {
  const { points, aidStations, settings } = course
  assertDomain(points.length >= 2, 'Parcours vide')
  assertDomain(/^\d{2}:\d{2}$/.test(settings.startTime), 'Heure de départ invalide (HH:MM)')

  const totalH = estimateRaceDurationH(
    { ...goal, distanceKm: course.totalDistanceKm, elevationGainM: course.elevationGainM },
    level,
  )
  const stations = [...aidStations].filter((a) => a.km > 0 && a.km < course.totalDistanceKm).sort((a, b) => a.km - b.km)
  const stopMin = (a: AidStation) => Math.round(a.major ? clamp(totalH * 1.5, 10, 40) : clamp(totalH * 0.5, 2, 10))
  const totalStopH = stations.reduce((sum, a) => sum + stopMin(a), 0) / 60
  const movingH = Math.max(totalH - totalStopH, totalH * 0.8)

  // Coût de chaque pas du profil, puis mise à l'échelle sur le temps en mouvement estimé.
  const divisor = DESCENT_DIVISOR[goal.technicity - 1]!
  const costs = points.slice(1).map((p, i) => {
    const prev = points[i]!
    const d = p.distanceKm - prev.distanceKm
    const delta = p.altitudeM - prev.altitudeM
    const base = d + Math.max(delta, 0) / 100 + Math.max(-delta, 0) / divisor
    return base * (1 + FATIGUE_DRIFT * (p.distanceKm / course.totalDistanceKm))
  })
  const scale = movingH / costs.reduce((a, b) => a + b, 0)

  // Temps écoulé à chaque point, arrêts aux ravitos inclus.
  const elapsed: number[] = [0]
  let stationIndex = 0
  points.slice(1).forEach((p, i) => {
    let t = elapsed[i]! + costs[i]! * scale
    while (stations[stationIndex] && stations[stationIndex]!.km <= p.distanceKm) {
      t += stopMin(stations[stationIndex]!) / 60
      stationIndex++
    }
    elapsed.push(t)
  })
  const timeAt = (km: number) => {
    const i = points.findIndex((p) => p.distanceKm >= km)
    if (i <= 0) return i === 0 ? 0 : elapsed.at(-1)!
    const a = points[i - 1]!
    const b = points[i]!
    const t = (km - a.distanceKm) / Math.max(b.distanceKm - a.distanceKm, 1e-6)
    return elapsed[i - 1]! + t * (elapsed[i]! - elapsed[i - 1]!)
  }

  const fueling = computeFuelingPlan({
    durationH: clamp(totalH, 0.5, 72),
    temperatureC: settings.temperatureC,
    weightKg: settings.weightKg,
    sweat: settings.sweat,
    gut: settings.gut,
  })

  const [startHour, startMinute] = settings.startTime.split(':').map(Number) as [number, number]
  const startMin = startHour * 60 + startMinute
  const clockOf = (hours: number) => {
    const total = startMin + Math.round(hours * 60)
    const minuteOfDay = ((total % 1440) + 1440) % 1440
    return {
      clock: `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`,
      day: Math.floor(total / 1440),
      night: minuteOfDay >= NIGHT_START_MIN || minuteOfDay < NIGHT_END_MIN,
    }
  }

  const checkpoints = [...stations, { name: 'Arrivée', km: course.totalDistanceKm, major: false, cutoffH: undefined } as AidStation]
  const warnings: string[] = []
  let previousKm = 0
  let previousDeparture = 0
  const splits: Split[] = checkpoints.map((station, i) => {
    const isFinish = i === checkpoints.length - 1
    const arrival = isFinish ? elapsed.at(-1)! : timeAt(station.km) - stopMin(station) / 60
    const legDurationH = arrival - previousDeparture
    const leg = legStats(points, previousKm, station.km)
    const { clock, day } = clockOf(arrival)
    const night = clockOf(previousDeparture + legDurationH / 2).night
    const marginH = station.cutoffH !== undefined ? station.cutoffH - arrival : undefined
    if (marginH !== undefined && marginH < 0) warnings.push(`Barrière horaire de ${station.name} dépassée de ${formatH(-marginH)} avec ce rythme.`)
    else if (marginH !== undefined && marginH < 1) warnings.push(`Marge serrée à ${station.name} : ${formatH(marginH)} seulement sur la barrière horaire.`)

    const split: Split = {
      name: station.name,
      km: round1(station.km),
      elapsedH: round2(arrival),
      clock,
      day,
      cutoffH: station.cutoffH,
      marginH: marginH !== undefined ? round2(marginH) : undefined,
      legDistanceKm: round1(station.km - previousKm),
      legGainM: leg.gain,
      legLossM: leg.loss,
      legDurationH: round2(legDurationH),
      stopMin: isFinish ? 0 : stopMin(station),
      night,
      nutrition: legNutrition(legDurationH, fueling.carbsPerHourG, fueling.fluidPerHourMl, fueling.sodiumPerHourMg, previousDeparture),
    }
    previousKm = station.km
    previousDeparture = arrival + split.stopMin / 60
    return split
  })

  const longestLeg = splits.reduce((a, b) => (b.legDurationH > a.legDurationH ? b : a))
  if (longestLeg.legDurationH > 4) {
    warnings.push(`Section la plus longue avant ${longestLeg.name} : ${formatH(longestLeg.legDurationH)} sans ravitaillement, prévois de l’autonomie.`)
  }
  if (splits.some((s) => s.night)) warnings.push('Une partie de la course se fait de nuit : frontale principale + de secours, piles neuves.')

  return {
    totalH: round2(elapsed.at(-1)!),
    movingH: round2(movingH),
    segments: segment(points, timeAt),
    splits,
    timeline: points
      .filter((_, i) => i % Math.ceil(points.length / 300) === 0 || i === points.length - 1)
      .map((p) => ({ km: round2(p.distanceKm), elapsedH: round2(timeAt(p.distanceKm)) })),
    warnings,
  }
}

function legStats(points: CoursePoint[], fromKm: number, toKm: number) {
  let gain = 0
  let loss = 0
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    if (p.distanceKm <= fromKm || points[i - 1]!.distanceKm >= toKm) continue
    const delta = p.altitudeM - points[i - 1]!.altitudeM
    if (delta > 0) gain += delta
    else loss -= delta
  }
  return { gain: roundTo(gain, 10), loss: roundTo(loss, 10) }
}

/** Glucides à emporter : la boisson d'effort (≈ 60 g/L) d'abord, le reste en solide. */
function legNutrition(durationH: number, carbsH: number, fluidH: number, sodiumH: number, startH: number): LegNutrition {
  const carbsG = Math.round(carbsH * durationH)
  const fluidMl = roundTo(fluidH * durationH, 50)
  const flasks = Math.max(1, Math.round(fluidMl / 500))
  const fromDrink = Math.min(Math.round(flasks * 500 * 0.06), carbsG)
  const solid = Math.max(carbsG - fromDrink, 0)
  const salty = startH >= 6
  const carry = [`${flasks} flasque${flasks > 1 ? 's' : ''} de 500 ml, dont 1 de boisson isotonique (${fromDrink} g)`]
  if (solid > 0) {
    const bars = Math.round(solid / 30)
    if (salty && bars >= 2) carry.push(`${Math.ceil(bars / 2)} rice cake salé + ${Math.floor(bars / 2)} pâte de fruits ou gel (${solid} g)`)
    else if (bars >= 1) carry.push(`${bars} barre${bars > 1 ? 's' : ''} ou gel${bars > 1 ? 's' : ''} maison (${solid} g)`)
  }
  if (durationH >= 2) carry.push(`Sel : ${Math.round(sodiumH * durationH)} mg de sodium (boisson + pastille si chaud)`)
  return { carbsG, fluidMl, sodiumMg: Math.round(sodiumH * durationH), carry }
}

/** Découpage montées / descentes / portions roulantes par recherche d'extrema avec hystérésis. */
function segment(points: CoursePoint[], timeAt: (km: number) => number): CourseSegment[] {
  const extrema: number[] = [0]
  let trend = 0
  let high = 0
  let low = 0
  for (let i = 1; i < points.length; i++) {
    const alt = points[i]!.altitudeM
    if (alt > points[high]!.altitudeM) high = i
    if (alt < points[low]!.altitudeM) low = i
    if (trend !== -1 && points[high]!.altitudeM - alt >= HYSTERESIS_M) {
      if (high !== extrema.at(-1)) extrema.push(high)
      trend = -1
      high = low = i
    } else if (trend !== 1 && alt - points[low]!.altitudeM >= HYSTERESIS_M) {
      if (low !== extrema.at(-1)) extrema.push(low)
      trend = 1
      high = low = i
    }
  }
  // Dernier extremum en cours (ex. fond de vallée suivi d'une portion plate jusqu'à l'arrivée).
  const pending = trend === -1 ? low : trend === 1 ? high : undefined
  if (pending !== undefined && pending !== extrema.at(-1) && pending !== points.length - 1) extrema.push(pending)
  if (extrema.at(-1) !== points.length - 1) extrema.push(points.length - 1)

  const raw: CourseSegment[] = []
  for (let i = 1; i < extrema.length; i++) {
    const a = points[extrema[i - 1]!]!
    const b = points[extrema[i]!]!
    const length = b.distanceKm - a.distanceKm
    if (length <= 0) continue
    const net = b.altitudeM - a.altitudeM
    const grade = (net / (length * 1000)) * 100
    const kind: SegmentKind = Math.abs(grade) < FLAT_GRADE_PCT ? 'ROULANT' : net > 0 ? 'MONTEE' : 'DESCENTE'
    const stats = legStats(points, a.distanceKm, b.distanceKm)
    raw.push({
      kind,
      startKm: a.distanceKm,
      endKm: b.distanceKm,
      gainM: stats.gain,
      lossM: stats.loss,
      avgGradePct: round1(grade),
      startElapsedH: 0,
      durationH: 0,
    })
  }

  // Fusion des segments consécutifs de même nature.
  const merged: CourseSegment[] = []
  for (const s of raw) {
    const last = merged.at(-1)
    if (last && last.kind === s.kind) {
      last.endKm = s.endKm
      last.gainM += s.gainM
      last.lossM += s.lossM
      const net = last.gainM - last.lossM
      last.avgGradePct = Math.round((net / ((last.endKm - last.startKm) * 1000)) * 1000) / 10
    } else merged.push({ ...s })
  }
  return merged.map((s) => {
    const start = timeAt(s.startKm)
    return {
      ...s,
      startKm: round1(s.startKm),
      endKm: round1(s.endKm),
      startElapsedH: round2(start),
      durationH: round2(timeAt(s.endKm) - start),
    }
  })
}

function formatH(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}
