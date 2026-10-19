import type { TerrainAccess } from '../athlete/athlete-profile'
import type { RaceGoal } from '../goal/race-goal'
import type { TrainingPhase } from './phase'
import type { SessionType, WorkoutStep, Zone } from './training-plan'

export interface SessionContext {
  durationMin: number
  phase: TrainingPhase
  /** Avancement dans la phase, de 0 (début) à 1 (fin). */
  progress: number
  goal: RaceGoal
  terrain: TerrainAccess
  raceDurationH: number
}

export interface SessionContent {
  title: string
  objective: string
  zone: Zone
  keySession: boolean
  steps: WorkoutStep[]
  tips: string[]
  /** Part du ratio D+/km de la course à reproduire sur cette séance (0 = plat). */
  verticalShare: number
}

const HILL_TERRAIN: Record<TerrainAccess, string> = {
  MONTAGNE: 'côte raide (10-20 %)',
  COLLINES: 'côte de 8-12 %',
  PLAT: 'escaliers, pont ou tapis incliné à 10-15 %',
}

const DOWNHILL_TERRAIN: Record<TerrainAccess, string> = {
  MONTAGNE: 'sentier technique en descente',
  COLLINES: 'descente de colline, si possible caillouteuse',
  PLAT: "escaliers en descente ou talus (à défaut, double la séance d'excentrique)",
}

function step(
  kind: WorkoutStep['kind'],
  label: string,
  durationMin: number,
  zone: Zone,
  extra: Partial<WorkoutStep> = {},
): WorkoutStep {
  // Précision à la seconde : les sprints en côte durent 10 s.
  return { kind, label, durationMin: Math.round(durationMin * 60) / 60, zone, ...extra }
}

function warmupAndCooldown(total: number, core: WorkoutStep[]): WorkoutStep[] {
  const coreMin = core.reduce((sum, s) => sum + s.durationMin * (s.repeat ?? 1), 0)
  const rest = Math.max(total - coreMin, 20)
  return [
    step('ECHAUFFEMENT', 'Footing progressif + gammes (montées de genoux, talons-fesses)', rest * 0.65, 2),
    ...core,
    step('RETOUR_CALME', 'Retour au calme en trottinant', rest * 0.35, 1),
  ]
}

function interpolate(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * Math.min(Math.max(progress, 0), 1))
}

export function describeSession(type: SessionType, ctx: SessionContext): SessionContent {
  const { durationMin: d, goal, terrain, progress, phase } = ctx
  const hill = HILL_TERRAIN[terrain]
  switch (type) {
    case 'ENDURANCE':
      return {
        title: 'Endurance fondamentale',
        objective: "Développer le moteur aérobie sans fatigue : la base de tout ultra.",
        zone: 2,
        keySession: false,
        steps: [step('CONTINU', 'Footing en aisance respiratoire, sur sentier si possible', d, 2)],
        tips: [
          'Tu dois pouvoir tenir une conversation : si tu souffles, marche dans les bosses.',
          terrain === 'PLAT' ? 'Choisis des chemins souples pour varier les appuis.' : 'Privilégie les sentiers vallonnés.',
        ],
        verticalShare: 0.5,
      }
    case 'RECUPERATION':
      return {
        title: 'Footing de récupération',
        objective: 'Faire circuler le sang et relâcher les jambes après une grosse séance.',
        zone: 1,
        keySession: false,
        steps: [step('CONTINU', 'Très facile, terrain plat et souple', d, 1)],
        tips: ['Allure ridicule assumée : le but est de récupérer, pas de progresser.'],
        verticalShare: 0.1,
      }
    case 'SORTIE_LONGUE': {
      const specific = phase === 'SPECIFIQUE' || phase === 'DEVELOPPEMENT'
      const core: WorkoutStep[] = specific
        ? [
            step('CONTINU', 'Endurance sur sentier vallonné', d * 0.55, 2),
            step('EFFORT', 'Bloc à allure course (montées marchées si > 15 %)', d * 0.3, 3),
            step('CONTINU', 'Fin en endurance, descente relâchée', d * 0.15, 2),
          ]
        : [step('CONTINU', 'Sortie longue en endurance, en marchant les fortes pentes', d, 2)]
      return {
        title: 'Sortie longue trail',
        objective: 'Habituer le corps à durer, travailler la gestion de l’effort et de la nutrition.',
        zone: 2,
        keySession: true,
        steps: core,
        tips: [
          d >= 120
            ? 'Entraîne ton intestin : vise 60 g de glucides/h dès la 1re heure (voir l’onglet Nutrition).'
            : 'Pars avec une flasque et une barre pour prendre l’habitude de manger en courant.',
          goal.polesAllowed && phase !== 'FONCIER' ? 'Prends les bâtons pour automatiser leur maniement.' : 'Marche activement dès que la pente dépasse 15 %.',
          'Teste ton matériel de course (chaussures, sac, chaussettes) en conditions réelles.',
        ],
        verticalShare: 1,
      }
    }
    case 'BACK_TO_BACK':
      return {
        title: 'Back-to-back : jambes fatiguées',
        objective: "Enchaîner le lendemain de la sortie longue pour simuler la 2e moitié d'un ultra.",
        zone: 2,
        keySession: true,
        steps: [step('CONTINU', 'Endurance sur terrain vallonné, régularité avant tout', d, 2)],
        tips: [
          'Commence très doucement : les 20 premières minutes sont souvent difficiles, c’est normal.',
          'Concentre-toi sur la technique de course malgré la fatigue (cadence, posture).',
        ],
        verticalShare: 0.8,
      }
    case 'SIMULATION': {
      const night = goal.nightSections
      return {
        title: night ? 'Simulation de course de nuit' : 'Simulation de course',
        objective: 'Répétition générale : allure, nutrition, matériel obligatoire et mental.',
        zone: 3,
        keySession: true,
        steps: [
          step('CONTINU', 'Départ maîtrisé, en dessous de l’allure course', d * 0.25, 2),
          step('EFFORT', 'Allure course cible, ravitaillement toutes les 30-40 min', d * 0.6, 3),
          step('CONTINU', 'Fin en gestion, notes sur les sensations', d * 0.15, 2),
        ],
        tips: [
          night ? 'Pars avant l’aube à la frontale pour valider l’éclairage et la vigilance de nuit.' : 'Pars à l’heure du départ réel.',
          'Utilise exactement la stratégie nutritionnelle prévue pour le jour J.',
          'Sac complet avec le matériel obligatoire pour valider le poids et les frottements.',
        ],
        verticalShare: 1,
      }
    }
    case 'COTES_COURTES': {
      const short = phase === 'FONCIER'
      const reps = short ? interpolate(8, 12, progress) : interpolate(8, 12, progress)
      const effortMin = short ? 10 / 60 : 0.5
      return {
        title: short ? 'Sprints en côte' : 'Côtes courtes (VMA en montée)',
        objective: short
          ? 'Recruter un maximum de fibres et renforcer pieds/chevilles sans traumatisme.'
          : 'Développer la puissance aérobie spécifique de la montée.',
        zone: 5,
        keySession: true,
        steps: warmupAndCooldown(d, [
          step('EFFORT', short ? '10" sprint en côte, très dynamique' : '30" vif en côte, foulée courte', effortMin, 5, {
            repeat: reps,
            terrain: hill,
          }),
          step('RECUP', 'Redescente en marchant / trottinant', short ? 1.5 : 1.5, 1, { repeat: reps }),
        ]),
        tips: ['Buste droit, regard loin, bras actifs : pousse le sol derrière toi.', `Terrain : ${hill}.`],
        verticalShare: 0.6,
      }
    }
    case 'SEUIL_MONTEE': {
      const blocks =
        phase === 'SPECIFIQUE'
          ? { reps: interpolate(3, 2, progress), min: interpolate(12, 20, progress) }
          : { reps: interpolate(5, 4, progress), min: interpolate(5, 8, progress) }
      return {
        title: 'Seuil en montée',
        objective: 'Repousser le seuil pour monter plus vite sans exploser.',
        zone: 4,
        keySession: true,
        steps: warmupAndCooldown(d, [
          step('EFFORT', 'Montée au seuil : difficile mais contrôlé (phrases courtes)', blocks.min, 4, {
            repeat: blocks.reps,
            terrain: terrain === 'PLAT' ? 'tapis incliné 6-10 % ou longue côte' : 'longue montée régulière',
          }),
          step('RECUP', 'Récupération en trottinant / redescente', Math.max(3, blocks.min / 3), 1, { repeat: blocks.reps }),
        ]),
        tips: [
          'Alterne course et marche rapide si la pente dépasse 15 % : c’est la réalité de la course.',
          'Allure régulière d’une répétition à l’autre, la dernière doit être la meilleure.',
        ],
        verticalShare: 1.4,
      }
    }
    case 'RANDO_COURSE':
      return {
        title: goal.polesAllowed ? 'Marche active avec bâtons' : 'Rando-course en pente raide',
        objective: 'En ultra on marche 30 à 50 % du temps : rendre cette marche rapide et économique.',
        zone: 3,
        keySession: true,
        steps: warmupAndCooldown(d, [
          step('EFFORT', goal.polesAllowed ? 'Marche rapide en pente forte, poussée sur les bâtons' : 'Marche rapide mains sur les cuisses', 8, 3, {
            repeat: 5,
            terrain: terrain === 'PLAT' ? 'escaliers ou tapis à 15 %' : 'pente > 15 %',
          }),
          step('RECUP', 'Descente souple en trottinant', 4, 2, { repeat: 5 }),
        ]),
        tips: [
          'Petits pas, cadence élevée, hanches avancées.',
          goal.polesAllowed ? 'Plante les bâtons à hauteur des pieds et pousse jusqu’en arrière.' : 'Mains sur les cuisses, pousse en extension.',
        ],
        verticalShare: 2,
      }
    case 'DESCENTE':
      return {
        title: 'Technique de descente',
        objective: 'Descendre vite et en sécurité, en préservant les quadriceps.',
        zone: 3,
        keySession: true,
        steps: warmupAndCooldown(d, [
          step('EFFORT', 'Descente rapide : regard 3-4 m devant, appuis courts et légers', 3, 4, {
            repeat: 6,
            terrain: DOWNHILL_TERRAIN[terrain],
          }),
          step('RECUP', 'Remontée en marche active', 4, 2, { repeat: 6 }),
        ]),
        tips: [
          'Bras écartés pour l’équilibre, buste légèrement penché vers l’avant.',
          'Fréquence élevée, ne freine pas avec les talons.',
          goal.technicity >= 4 ? 'Ta course est très technique : cherche des pierriers et des racines.' : 'Varie les terrains : herbe, cailloux, terre.',
        ],
        verticalShare: 1.2,
      }
    case 'FARTLEK':
      return {
        title: 'Fartlek nature',
        objective: 'Varier les allures au feeling en suivant le relief.',
        zone: 3,
        keySession: false,
        steps: warmupAndCooldown(d, [
          step('EFFORT', 'Accélération vive (sur une bosse si possible)', 1, 4, { repeat: 8 }),
          step('RECUP', 'Footing souple', 2, 2, { repeat: 8 }),
        ]),
        tips: ['Pas de montre : accélère d’un arbre à l’autre, au plaisir.'],
        verticalShare: 0.7,
      }
    case 'VELO_ENDURANCE':
      return {
        title: 'Vélo en endurance',
        objective: 'Développer le foncier en épargnant les articulations.',
        zone: 2,
        keySession: false,
        steps: [step('CONTINU', 'Vélo route, VTT ou home-trainer, cadence 85-95 tr/min', d, 2)],
        tips: ['Le vélo compte ~2/3 d’une sortie à pied en charge : idéal pour monter en volume.'],
        verticalShare: 0,
      }
    case 'VELO_FORCE':
      return {
        title: 'Vélo force en côte',
        objective: 'Force-endurance des quadriceps pour les longues montées.',
        zone: 3,
        keySession: false,
        steps: [
          step('ECHAUFFEMENT', 'Échauffement progressif', 15, 2),
          step('EFFORT', 'Gros braquet, 55-65 tr/min, assis, buste gainé', 6, 3, { repeat: 5 }),
          step('RECUP', 'Petit braquet, moulinage', 3, 1, { repeat: 5 }),
          step('RETOUR_CALME', 'Retour au calme', Math.max(d - 60, 5), 1),
        ],
        tips: ['Sur home-trainer, simule une pente de 6-8 %.'],
        verticalShare: 0,
      }
    case 'RENFORCEMENT':
      return {
        title: 'Renforcement musculaire',
        objective: 'Blinder les quadriceps pour les descentes et prévenir les blessures.',
        zone: 2,
        keySession: false,
        steps: [],
        tips: ['Lance la séance guidée pour suivre chaque exercice avec démonstration et minuteur.'],
        verticalShare: 0,
      }
    case 'COURSE':
      return {
        title: `Jour J : ${goal.name}`,
        objective: 'Profite : tout le travail est fait.',
        zone: 3,
        keySession: true,
        steps: [step('CONTINU', 'Course ! Pars lentement, mange tôt, marche les montées', d, 3)],
        tips: [
          'Les 3 premières heures doivent sembler trop faciles.',
          'Mange et bois avant d’avoir faim et soif : alarme toutes les 20-30 min.',
          'Un coup de moins bien finit toujours par passer : mange, marche, repars.',
        ],
        verticalShare: 1,
      }
  }
}
