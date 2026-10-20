import type { StrengthRoutine } from '../../domain/strength/routine'

export const ROUTINES: StrengthRoutine[] = [
  {
    id: 'fondations-trail',
    name: 'Fondations trail',
    phases: ['BASE'],
    durationMin: 35,
    focus: 'Force générale et gainage',
    description:
      "Construire les bases : renforcer les grandes chaînes musculaires et le tronc avant d'ajouter du volume et du dénivelé. Charge modérée, technique impeccable.",
    blocks: [
      { exerciseId: 'squat', sets: 3, reps: 12, restSec: 60 },
      { exerciseId: 'fente-avant', sets: 3, reps: 10, restSec: 60, perSide: true },
      { exerciseId: 'pont-fessier-unipodal', sets: 3, reps: 12, restSec: 45, perSide: true },
      { exerciseId: 'mollets-marche', sets: 3, reps: 15, restSec: 45 },
      { exerciseId: 'planche', sets: 3, durationSec: 40, restSec: 30 },
      { exerciseId: 'bird-dog', sets: 2, reps: 10, restSec: 30, perSide: true },
      { exerciseId: 'fente-psoas', sets: 1, durationSec: 40, restSec: 10, perSide: true, notes: 'Retour au calme' },
    ],
  },
  {
    id: 'chevilles-proprio',
    name: 'Chevilles & proprioception',
    phases: ['BASE', 'BUILD'],
    durationMin: 20,
    focus: 'Prévention des entorses et du tendon d’Achille',
    description:
      'Séance courte, idéale après un footing : stabilité de cheville, contrôle de hanche et mobilité pour encaisser les sentiers techniques.',
    blocks: [
      { exerciseId: 'mobilite-cheville-mur', sets: 2, reps: 10, restSec: 15, perSide: true },
      { exerciseId: 'equilibre-coussin', sets: 3, durationSec: 30, restSec: 20, perSide: true },
      { exerciseId: 'souleve-de-terre-unipodal', sets: 2, reps: 8, restSec: 30, perSide: true },
      { exerciseId: 'mollets-excentriques', sets: 2, reps: 12, restSec: 30, tempo: '4-0-1', perSide: true },
      { exerciseId: 'avion', sets: 2, reps: 5, restSec: 30, perSide: true },
      { exerciseId: 'planche-laterale', sets: 2, durationSec: 30, restSec: 20, perSide: true },
    ],
  },
  {
    id: 'force-excentrique',
    name: 'Force excentrique « spécial descente »',
    phases: ['BUILD', 'SPECIFIC'],
    durationMin: 45,
    focus: 'Quadriceps et ischios en freinage',
    description:
      "Le cœur de la préparation ultra : des cuisses capables de freiner pendant des milliers de mètres de D-. Descentes lentes, remontées dynamiques. Prévois 48 h sans séance de descente rapide après.",
    blocks: [
      { exerciseId: 'squat-excentrique', sets: 4, reps: 8, restSec: 90, tempo: '5-1-1' },
      { exerciseId: 'fente-bulgare', sets: 3, reps: 8, restSec: 75, tempo: '3-1-1', perSide: true },
      { exerciseId: 'step-down-excentrique', sets: 3, reps: 10, restSec: 60, tempo: '4-0-1', perSide: true },
      { exerciseId: 'nordic-hamstring', sets: 3, reps: 5, restSec: 90 },
      { exerciseId: 'step-up', sets: 3, reps: 10, restSec: 60, perSide: true },
      { exerciseId: 'mollets-excentriques', sets: 3, reps: 12, restSec: 45, tempo: '4-0-1', perSide: true },
      { exerciseId: 'chaise', sets: 2, durationSec: 60, restSec: 45, notes: 'Finisher' },
    ],
  },
  {
    id: 'pliometrie-trail',
    name: 'Pliométrie & réactivité',
    phases: ['SPECIFIC'],
    durationMin: 35,
    focus: 'Puissance, raideur tendineuse, économie de course',
    description:
      'Convertir la force en puissance : sauts courts et de qualité, récupération complète entre les séries. À faire frais, jamais au lendemain d’une sortie longue.',
    blocks: [
      { exerciseId: 'skipping', sets: 3, durationSec: 20, restSec: 40, notes: 'Échauffement dynamique' },
      { exerciseId: 'squat-jump', sets: 4, reps: 6, restSec: 75 },
      { exerciseId: 'sauts-sur-box', sets: 4, reps: 5, restSec: 75 },
      { exerciseId: 'fentes-sautees', sets: 3, reps: 8, restSec: 75 },
      { exerciseId: 'bondissements', sets: 4, reps: 10, restSec: 90, notes: '10 foulées par série, retour en marchant' },
      { exerciseId: 'planche-laterale', sets: 2, durationSec: 30, restSec: 20, perSide: true },
    ],
  },
  {
    id: 'gainage-express',
    name: 'Gainage express',
    phases: ['BASE', 'BUILD', 'SPECIFIC', 'TAPER'],
    durationMin: 15,
    focus: 'Tronc solide pour porter le sac',
    description:
      'Circuit de gainage à enchaîner après n’importe quel footing. 2 tours, 20 secondes de transition entre les exercices.',
    blocks: [
      { exerciseId: 'planche', sets: 2, durationSec: 45, restSec: 20 },
      { exerciseId: 'planche-laterale', sets: 2, durationSec: 30, restSec: 20, perSide: true },
      { exerciseId: 'dead-bug', sets: 2, reps: 10, restSec: 20, perSide: true },
      { exerciseId: 'bird-dog', sets: 2, reps: 8, restSec: 20, perSide: true },
      { exerciseId: 'pont-fessier-unipodal', sets: 2, reps: 10, restSec: 20, perSide: true },
    ],
  },
  {
    id: 'entretien-affutage',
    name: 'Entretien affûtage',
    phases: ['TAPER', 'RACE'],
    durationMin: 20,
    focus: 'Garder le tonus sans fatigue',
    description:
      'Volume réduit, intensité légère : on entretient les acquis et l’activation neuromusculaire sans créer de courbatures avant la course.',
    blocks: [
      { exerciseId: 'mobilite-cheville-mur', sets: 1, reps: 10, restSec: 15, perSide: true },
      { exerciseId: 'squat', sets: 2, reps: 10, restSec: 45 },
      { exerciseId: 'step-up', sets: 2, reps: 8, restSec: 45, perSide: true },
      { exerciseId: 'equilibre-coussin', sets: 2, durationSec: 30, restSec: 20, perSide: true },
      { exerciseId: 'skipping', sets: 2, durationSec: 15, restSec: 45 },
      { exerciseId: 'planche', sets: 2, durationSec: 30, restSec: 20 },
    ],
  },
]
