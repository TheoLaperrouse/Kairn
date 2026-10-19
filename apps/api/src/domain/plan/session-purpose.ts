import type { AthleteProfile } from '../athlete/athlete-profile'
import { estimateRaceDurationH, type RaceGoal } from '../goal/race-goal'
import type { TrainingPhase } from './phase'
import type { PlannedSession, SessionType, TrainingPlan } from './training-plan'

interface PurposeContext {
  phase: TrainingPhase
  goal: RaceGoal
  /** Durée de course estimée, en heures. */
  raceHours: number
}

function hoursLabel(hours: number): string {
  return hours < 1.5 ? 'l’heure et quelque' : `${Math.round(hours)} h`
}

function elevationLabel(goal: RaceGoal): string {
  return `${goal.elevationGainM.toLocaleString('fr-FR').replace(/ /g, ' ')} m de D+`
}

const PURPOSES: Record<SessionType, (c: PurposeContext) => string> = {
  ENDURANCE: ({ phase, raceHours }) =>
    phase === 'FONCIER'
      ? `Construit le moteur aérobie qui te portera pendant les ${hoursLabel(raceHours)} de course : chaque minute en aisance compte.`
      : phase === 'AFFUTAGE' || phase === 'COURSE'
        ? 'Garde les jambes en mouvement sans fatigue : l’affûtage réduit le volume, pas la régularité.'
        : 'Entretient la base aérobie entre les séances clés : en aisance, elle ajoute du volume tout en laissant récupérer.',
  RECUPERATION: () => 'Accélère la récupération de la séance précédente : le sang circule, sans ajouter de fatigue.',
  SORTIE_LONGUE: ({ phase, goal, raceHours }) => {
    if (phase === 'FONCIER') return `Habitue le corps à la durée et à puiser dans les graisses : la première brique pour tenir ${hoursLabel(raceHours)}.`
    if (phase === 'AFFUTAGE' || phase === 'COURSE') return 'Dernière sortie un peu longue : rester en confiance sans entamer la fraîcheur.'
    if (phase === 'SPECIFIQUE') {
      const night = goal.nightSections ? ' Fais-en une partie à la frontale si tu peux : la course passe la nuit dehors.' : ''
      return `Répète l’effort du jour J : allure, ravitaillement et matériel, sur le terrain le plus proche possible.${night}`
    }
    return 'Allonge le temps sur les pieds et encaisse du D+ : c’est la séance qui ressemble le plus à ta course.'
  },
  BACK_TO_BACK: () => 'Courir sur des jambes déjà entamées par la veille : c’est ce que demandera la seconde moitié de ta course.',
  SIMULATION: ({ goal }) =>
    `Répétition générale : rythme, ravitos et matériel${goal.nightSections ? ', frontale comprise,' : ''} comme le jour J, où rien ne doit être nouveau.`,
  COTES_COURTES: ({ goal }) => `Développe force et puissance en montée : les ${elevationLabel(goal)} de ta course se gravissent avec des jambes fortes.`,
  SEUIL_MONTEE: () => 'Repousse ton seuil en côte : tenir plus longtemps un rythme soutenu dans les longues montées de ta course.',
  RANDO_COURSE: ({ goal }) =>
    `Travaille la marche active${goal.polesAllowed ? ' avec bâtons' : ''} : en ultra, on monte souvent plus vite et plus économiquement en marchant fort qu’en trottinant.`,
  DESCENTE: ({ goal }) =>
    `Technique et solidité en descente${goal.technicity >= 4 ? ' sur terrain technique' : ''} : c’est là que se perd le plus de temps et que les quadriceps lâchent.`,
  FARTLEK: () => 'Varie les allures au feeling pour réveiller la vitesse, sans la rigidité d’un fractionné.',
  RENFORCEMENT: () => 'Renforce tendons, chevilles et muscles stabilisateurs : moins de blessures, et des descentes mieux encaissées.',
  VELO_ENDURANCE: () => 'Du volume aérobie sans impacts : le cœur travaille pendant que les articulations se reposent.',
  VELO_FORCE: () => 'De la force en côte sans les chocs de la course : quadriceps et fessiers s’en souviendront dans les montées.',
  COURSE: ({ goal }) => `${goal.name}, c’est aujourd’hui : tout le travail est fait, fais-toi confiance.`,
}

/** Rôle de la séance dans la préparation, relié à la course visée. */
export function sessionPurpose(session: PlannedSession, plan: TrainingPlan, goal: RaceGoal, profile: Pick<AthleteProfile, 'level'>): string {
  const phase = plan.weeks.find((w) => w.index === session.weekIndex)?.phase ?? 'DEVELOPPEMENT'
  return PURPOSES[session.type]({ phase, goal, raceHours: estimateRaceDurationH(goal, profile.level) })
}

export function withPurposes(plan: TrainingPlan, goal: RaceGoal | undefined, profile: Pick<AthleteProfile, 'level'> | undefined): TrainingPlan {
  if (!goal || !profile) return plan
  return { ...plan, sessions: plan.sessions.map((s) => ({ ...s, purpose: sessionPurpose(s, plan, goal, profile) })) }
}
