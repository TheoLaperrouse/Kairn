import {
  Bike,
  Dumbbell,
  Flag,
  Footprints,
  Mountain,
  MountainSnow,
  Moon,
  Repeat,
  TrendingDown,
  TrendingUp,
  Waves,
  Wind,
  Zap,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { SessionType } from '../../domain/models'

/** Icône représentative de chaque type de séance. */
export const SESSION_ICONS: Record<SessionType, Component> = {
  ENDURANCE: Footprints,
  RECUPERATION: Waves,
  SORTIE_LONGUE: Mountain,
  BACK_TO_BACK: Repeat,
  SIMULATION: Moon,
  COTES_COURTES: Zap,
  SEUIL_MONTEE: TrendingUp,
  RANDO_COURSE: MountainSnow,
  DESCENTE: TrendingDown,
  FARTLEK: Wind,
  RENFORCEMENT: Dumbbell,
  VELO_ENDURANCE: Bike,
  VELO_FORCE: Bike,
  COURSE: Flag,
}
