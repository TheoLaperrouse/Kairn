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

export const SESSION_ICONS: Record<SessionType, Component> = {
  ENDURANCE: Footprints,
  RECOVERY: Waves,
  LONG_RUN: Mountain,
  BACK_TO_BACK: Repeat,
  SIMULATION: Moon,
  HILL_REPEATS: Zap,
  UPHILL_THRESHOLD: TrendingUp,
  HIKE_RUN: MountainSnow,
  DOWNHILL: TrendingDown,
  FARTLEK: Wind,
  STRENGTH: Dumbbell,
  BIKE_ENDURANCE: Bike,
  BIKE_STRENGTH: Bike,
  RACE: Flag,
}
