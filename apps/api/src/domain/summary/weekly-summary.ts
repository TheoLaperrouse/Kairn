import type { Activity } from '../activity/activity'
import { type Climb } from '../analysis/climbs'
import { shareAtOrAbove, totalSeconds, type TimeInZones } from '../analysis/heart-rate-zones'
import { analyzeWorkout, type Insight, type Verdict, type WorkoutAnalysis } from '../analysis/workout-analysis'
import type { AthleteProfile } from '../athlete/athlete-profile'
import type { RaceGoal } from '../goal/race-goal'
import { PHASE_LABELS, type TrainingPhase } from '../plan/phase'
import type { PlanWeek, PlannedSession, SessionStatus, TrainingPlan } from '../plan/training-plan'
import { addDays, daysBetween, type IsoDate } from '../shared/dates'
import { formatInt, formatKm, formatMinutes, formatPercent } from '../shared/format'
import { computeLoadSeries } from '../training-load/training-load'
import { computeReadiness, type CheckIn } from '../wellness/check-in'

export interface WeekInfo {
  index: number
  phase: TrainingPhase
  phaseLabel: string
  isRecovery: boolean
  focus: string
}

export interface WeekVolumeTotals {
  hours: number
  km: number
  elevationM: number
}

export interface SummaryHighlight {
  label: string
  value: string
  detail?: string
  activityId?: string
}

export interface WeeklySummary {
  weekStart: IsoDate
  weekEnd: IsoDate
  /** La semaine n'est pas terminée : bilan provisoire. */
  inProgress: boolean
  week?: WeekInfo
  goalName?: string
  daysToRace?: number
  totals: WeekVolumeTotals & { activities: number; load: number }
  targets?: WeekVolumeTotals
  sessions: { planned: number; done: number; skipped: number; missed: number }
  keySessions: Array<{ id: string; title: string; date: IsoDate; status: SessionStatus; verdict?: Verdict; activityId?: string }>
  /** Temps passé dans chaque zone (course et vélo), si la FC est disponible. */
  zones?: TimeInZones
  verdicts: Partial<Record<Verdict, number>>
  /** `reliable` : au moins 4 semaines d'historique, sans quoi forme et fraîcheur partent de zéro et n'ont pas de sens. */
  form: { fitness: number; fitnessChange: number; freshness: number; reliable: boolean }
  readiness?: { average: number; days: number; redDays: number }
  highlights: SummaryHighlight[]
  insights: Insight[]
  nextWeek?: WeekInfo & { targets: WeekVolumeTotals; keySessions: Array<{ id: string; title: string; date: IsoDate }> }
  headline: string
  activities: Array<{ id: string; name: string; startTime: string; sport: Activity['sport']; durationSec: number; distanceKm: number; elevationGainM: number; verdict: Verdict; headline: string }>
}

export interface SummaryInput {
  weekStart: IsoDate
  today: IsoDate
  profile: AthleteProfile
  goal?: RaceGoal
  plan?: TrainingPlan
  /** Toutes les activités de l'utilisateur (l'historique sert à la charge et aux tendances). */
  activities: Activity[]
  checkIns: CheckIn[]
}

const day = (activity: Activity) => activity.startTime.slice(0, 10)

/** Historique minimal pour que le modèle forme / fatigue soit interprétable. */
const HISTORY_FOR_FORM_DAYS = 28

function volumeOf(activities: Activity[]): WeekVolumeTotals {
  const endurance = activities.filter((a) => a.sport !== 'STRENGTH')
  const runs = activities.filter((a) => a.sport === 'RUN')
  return {
    hours: Math.round(endurance.reduce((s, a) => s + a.durationSec, 0) / 360) / 10,
    km: Math.round(runs.reduce((s, a) => s + a.distanceKm, 0) * 10) / 10,
    elevationM: Math.round(runs.reduce((s, a) => s + a.elevationGainM, 0)),
  }
}

function weekInfo(week: PlanWeek): WeekInfo {
  return { index: week.index, phase: week.phase, phaseLabel: PHASE_LABELS[week.phase], isRecovery: week.isRecovery, focus: week.focus }
}

function inWeek(start: IsoDate) {
  const end = addDays(start, 6)
  return (date: IsoDate) => date >= start && date <= end
}

export function buildWeeklySummary(input: SummaryInput): WeeklySummary {
  const { weekStart, today, profile, plan } = input
  const weekEnd = addDays(weekStart, 6)
  const within = inWeek(weekStart)
  const activities = input.activities.filter((a) => within(day(a))).sort((a, b) => a.startTime.localeCompare(b.startTime))
  const sessions = (plan?.sessions ?? []).filter((s) => within(s.date) && s.type !== 'COURSE')
  const planWeek = plan?.weeks.find((w) => w.startDate === weekStart)

  const analyses = new Map<string, WorkoutAnalysis>()
  for (const activity of activities) {
    const session = plan?.sessions.find((s) => s.id === activity.plannedSessionId)
    analyses.set(activity.id, analyzeWorkout(activity, { profile, session, sessions: plan?.sessions ?? [], history: input.activities }))
  }

  const zones = aggregateZones([...analyses.values()].flatMap((a) => (a.zones ? [a.zones.seconds] : [])))
  const verdicts: Partial<Record<Verdict, number>> = {}
  for (const analysis of analyses.values()) verdicts[analysis.verdict] = (verdicts[analysis.verdict] ?? 0) + 1

  const past = sessions.filter((s) => s.date < today || s.status !== 'PLANNED')
  const sessionCounts = {
    planned: sessions.length,
    done: sessions.filter((s) => s.status === 'DONE').length,
    skipped: sessions.filter((s) => s.status === 'SKIPPED').length,
    missed: past.filter((s) => s.status === 'PLANNED').length,
  }
  const keySessions = sessions
    .filter((s) => s.keySession)
    .map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date,
      status: s.status,
      activityId: s.activityId,
      verdict: s.activityId ? analyses.get(s.activityId)?.verdict : undefined,
    }))

  const totals = { ...volumeOf(activities), activities: activities.length, load: [...analyses.values()].reduce((s, a) => s + a.load, 0) }
  const targets = planWeek ? { hours: planWeek.targetHours, km: planWeek.targetKm, elevationM: planWeek.targetElevationM } : undefined

  const series = computeLoadSeries(
    input.activities,
    (plan?.sessions ?? []).filter((s) => s.type !== 'COURSE'),
    profile,
    addDays(weekStart, -126),
    weekEnd,
    today < weekEnd ? today : weekEnd,
  )
  const endPoint = series.find((p) => p.date === (today < weekEnd ? today : weekEnd)) ?? series.at(-1)!
  const startPoint = series.find((p) => p.date === addDays(weekStart, -1)) ?? series[0]!
  const form = {
    fitness: Math.round(endPoint.fitness),
    fitnessChange: Math.round((endPoint.fitness - startPoint.fitness) * 10) / 10,
    freshness: Math.round(endPoint.form),
    reliable: input.activities.some((a) => day(a) < addDays(weekStart, -HISTORY_FOR_FORM_DAYS)),
  }

  const weekCheckIns = input.checkIns.filter((c) => within(c.date))
  const readinessScores = weekCheckIns.map((c) => computeReadiness(c, input.checkIns.filter((h) => h.date < c.date)))
  const readiness = readinessScores.length
    ? {
        average: Math.round(readinessScores.reduce((s, r) => s + r.score, 0) / readinessScores.length),
        days: readinessScores.length,
        redDays: readinessScores.filter((r) => r.level === 'ROUGE').length,
      }
    : undefined

  const nextPlanWeek = plan?.weeks.find((w) => w.startDate === addDays(weekStart, 7))
  const nextWeek = nextPlanWeek
    ? {
        ...weekInfo(nextPlanWeek),
        targets: { hours: nextPlanWeek.targetHours, km: nextPlanWeek.targetKm, elevationM: nextPlanWeek.targetElevationM },
        keySessions: plan!.sessions
          .filter((s) => s.weekIndex === nextPlanWeek.index && (s.keySession || s.type === 'COURSE'))
          .map((s) => ({ id: s.id, title: s.title, date: s.date })),
      }
    : undefined

  const summary: WeeklySummary = {
    weekStart,
    weekEnd,
    inProgress: today <= weekEnd,
    week: planWeek ? weekInfo(planWeek) : undefined,
    goalName: input.goal?.name,
    daysToRace: input.goal ? daysBetween(weekEnd, input.goal.raceDate) : undefined,
    totals,
    targets,
    sessions: sessionCounts,
    keySessions,
    zones,
    verdicts,
    form,
    readiness,
    highlights: highlights(activities, analyses),
    insights: [],
    nextWeek,
    headline: '',
    activities: activities.map((a) => ({
      id: a.id,
      name: a.name,
      startTime: a.startTime,
      sport: a.sport,
      durationSec: a.durationSec,
      distanceKm: a.distanceKm,
      elevationGainM: a.elevationGainM,
      verdict: analyses.get(a.id)!.verdict,
      headline: analyses.get(a.id)!.headline,
    })),
  }
  summary.insights = insights(summary, input, analyses)
  summary.headline = headline(summary)
  return summary
}

function aggregateZones(list: TimeInZones[]): TimeInZones | undefined {
  if (list.length === 0) return undefined
  const total: TimeInZones = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const zones of list) for (const z of [1, 2, 3, 4, 5] as const) total[z] += zones[z]
  return totalSeconds(total) > 0 ? total : undefined
}

function highlights(activities: Activity[], analyses: Map<string, WorkoutAnalysis>): SummaryHighlight[] {
  const list: SummaryHighlight[] = []
  const endurance = activities.filter((a) => a.sport !== 'STRENGTH')
  const longest = [...endurance].sort((a, b) => b.durationSec - a.durationSec)[0]
  if (longest) {
    list.push({
      label: 'Plus longue sortie',
      value: formatMinutes(longest.durationSec / 60),
      detail: `${longest.name} · ${formatKm(longest.distanceKm)}${longest.elevationGainM ? ` · ${formatInt(longest.elevationGainM)} m D+` : ''}`,
      activityId: longest.id,
    })
  }
  const climbs = activities.flatMap((a) => (analyses.get(a.id)?.climbs ?? []).map((c): [Activity, Climb] => [a, c]))
  const biggest = climbs.sort((x, y) => y[1].elevationM - x[1].elevationM)[0]
  if (biggest) {
    list.push({
      label: 'Plus grosse montée',
      value: `${formatInt(biggest[1].elevationM)} m`,
      detail: `${biggest[0].name} · ${biggest[1].gradePct.toLocaleString('fr-FR')} % · ${formatInt(biggest[1].verticalSpeed)} m/h`,
      activityId: biggest[0].id,
    })
  }
  const best = activities
    .flatMap((a) => {
      const climb = analyses.get(a.id)?.bestClimb
      return climb ? [[a, climb] as const] : []
    })
    .sort((x, y) => y[1].verticalSpeed - x[1].verticalSpeed)[0]
  if (best) {
    list.push({
      label: 'Meilleure VAM',
      value: `${formatInt(best[1].verticalSpeed)} m/h`,
      detail: `${best[0].name} · ${formatInt(best[1].elevationM)} m à ${best[1].gradePct.toLocaleString('fr-FR')} %`,
      activityId: best[0].id,
    })
  }
  return list
}

/** Ratio du volume horaire réalisé sur la cible d'une semaine du plan. */
function hoursRatio(input: SummaryInput, week: PlanWeek): number | undefined {
  if (week.targetHours <= 0) return undefined
  const within = inWeek(week.startDate)
  return volumeOf(input.activities.filter((a) => within(day(a)))).hours / week.targetHours
}

function insights(summary: WeeklySummary, input: SummaryInput, analyses: Map<string, WorkoutAnalysis>): Insight[] {
  const list: Insight[] = []
  const { totals, targets, week } = summary
  const finished = !summary.inProgress

  if (targets && targets.hours > 0) {
    const ratio = totals.hours / targets.hours
    if (week?.isRecovery && ratio > 1.1) {
      list.push({
        tone: 'ATTENTION',
        topic: 'CHARGE',
        title: 'Semaine allégée non respectée',
        text: `${formatPercent(ratio)} du volume prévu sur une semaine de récupération. C’est pendant ces semaines que le corps assimile le travail : la prochaine fois, lève le pied.`,
      })
    } else if (ratio > 1.15) {
      list.push({
        tone: 'ATTENTION',
        topic: 'CHARGE',
        title: 'Au-delà du volume prévu',
        text: `${formatPercent(ratio)} du volume horaire prévu. Plus n’est pas mieux : le risque de blessure grimpe avec les hausses brutales.`,
      })
    } else if (ratio >= 0.9) {
      list.push({ tone: 'POSITIVE', topic: 'CHARGE', title: 'Volume tenu', text: `${formatPercent(ratio)} du volume horaire prévu (${formatMinutes(totals.hours * 60)} sur ${formatMinutes(targets.hours * 60)}).` })
    } else if (finished && ratio < 0.75) {
      list.push({
        tone: 'ATTENTION',
        topic: 'CHARGE',
        title: 'Volume en retrait',
        text: `${formatPercent(ratio)} du volume horaire prévu (${formatMinutes(totals.hours * 60)} sur ${formatMinutes(targets.hours * 60)}).`,
      })
    }
  }

  const previous = input.plan?.weeks.find((w) => w.startDate === addDays(summary.weekStart, -7))
  const current = input.plan?.weeks.find((w) => w.startDate === summary.weekStart)
  if (finished && previous && current && !previous.isRecovery && !current.isRecovery) {
    const ratios = [hoursRatio(input, previous), hoursRatio(input, current)]
    if (ratios.every((r) => r !== undefined && r < 0.8)) {
      list.push({
        tone: 'ATTENTION',
        topic: 'DUREE',
        title: 'Plan trop ambitieux ?',
        text: 'Deux semaines de suite sous 80 % du volume prévu. Si ton emploi du temps ne suit pas, baisse tes heures disponibles dans ton profil puis régénère le plan : mieux vaut un plan tenu qu’un plan subi.',
      })
    }
  }

  const missedKeys = summary.keySessions.filter((s) => s.status !== 'DONE' && (finished || s.date < input.today))
  if (missedKeys.length) {
    list.push({
      tone: 'ATTENTION',
      topic: 'INTENSITE',
      title: missedKeys.length > 1 ? 'Séances clés manquées' : 'Séance clé manquée',
      text: `${missedKeys.map((s) => `« ${s.title} »`).join(', ')} : ce sont elles qui font progresser. Kairn les décale quand c’est possible sans risque.`,
    })
  } else if (summary.keySessions.length && summary.keySessions.every((s) => s.status === 'DONE')) {
    list.push({
      tone: 'POSITIVE',
      topic: 'INTENSITE',
      title: 'Séances clés réalisées',
      text: `${summary.keySessions.length === 1 ? 'La séance clé est faite' : `Les ${summary.keySessions.length} séances clés sont faites`} : l’essentiel de la semaine est dans les jambes.`,
    })
  }

  if (summary.zones) {
    const easy = 1 - shareAtOrAbove(summary.zones, 3)
    const tooIntense = summary.verdicts.TROP_INTENSE ?? 0
    if (easy < 0.7 || tooIntense >= 2) {
      list.push({
        tone: 'ATTENTION',
        topic: 'INTENSITE',
        title: 'Trop d’intensité',
        text: `${formatPercent(easy)} du temps en Z1-Z2${tooIntense >= 2 ? `, et ${tooIntense} séances faciles courues trop vite` : ''}. En ultra, 75 à 80 % du temps en endurance fondamentale est la base : ralentis les footings pour mieux réussir les séances dures.`,
      })
    } else if (easy >= 0.75) {
      list.push({ tone: 'POSITIVE', topic: 'INTENSITE', title: 'Bonne répartition', text: `${formatPercent(easy)} du temps en Z1-Z2 : l’intensité est concentrée là où elle compte.` })
    }
  }

  const bestVams = [...analyses.values()].flatMap((a) => (a.bestClimb && a.vamBaseline ? [{ vam: a.bestClimb.verticalSpeed, baseline: a.vamBaseline }] : []))
  const top = bestVams.sort((x, y) => y.vam / y.baseline - x.vam / x.baseline)[0]
  if (top && top.vam / top.baseline - 1 >= 0.05) {
    list.push({
      tone: 'POSITIVE',
      topic: 'MONTEE',
      title: 'Progression en montée',
      text: `Meilleure VAM à ${formatInt(top.vam)} m/h, ${formatPercent(top.vam / top.baseline - 1)} au-dessus de ta référence des 8 dernières semaines.`,
    })
  }

  if (!summary.form.reliable) {
    // Pas de commentaire sur la forme : le modèle n'a pas encore assez d'historique.
  } else if (summary.form.freshness <= -25) {
    list.push({
      tone: 'ATTENTION',
      topic: 'CHARGE',
      title: 'Fatigue élevée',
      text: `Fraîcheur à ${summary.form.freshness}.${summary.nextWeek?.isRecovery ? ' La semaine allégée qui arrive tombe à pic : respecte-la.' : ' Soigne sommeil et alimentation, et n’hésite pas à alléger une séance si le bilan du matin passe à l’orange.'}`,
    })
  } else if (summary.form.fitnessChange > 0 && finished) {
    list.push({
      tone: 'POSITIVE',
      topic: 'CHARGE',
      title: 'Forme en hausse',
      text: `Forme de fond à ${summary.form.fitness} (+${summary.form.fitnessChange.toLocaleString('fr-FR')} sur la semaine).`,
    })
  }

  if (summary.readiness && (summary.readiness.redDays >= 2 || summary.readiness.average < 50)) {
    list.push({
      tone: 'ATTENTION',
      topic: 'CHARGE',
      title: 'Récupération difficile',
      text: `Score de forme moyen de ${summary.readiness.average}/100 au réveil${summary.readiness.redDays ? `, dont ${summary.readiness.redDays} jour(s) au rouge` : ''}. Le sommeil est ton meilleur allié.`,
    })
  }
  return list
}

function headline(summary: WeeklySummary): string {
  const { totals, sessions, week } = summary
  const parts = [formatMinutes(totals.hours * 60)]
  if (totals.km > 0) parts.push(formatKm(totals.km))
  if (totals.elevationM > 0) parts.push(`${formatInt(totals.elevationM)} m D+`)
  const prefix = week ? `Semaine ${week.index + 1} · ${week.phaseLabel}` : 'Ta semaine'
  const done = sessions.planned ? ` · ${sessions.done}/${sessions.planned} séances` : ''
  return `${prefix} : ${parts.join(', ')}${done}.`
}
