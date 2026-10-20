import { assertDomain } from '../shared/errors'
import { clamp } from '../shared/math'

export type SweatProfile = 'FAIBLE' | 'MOYEN' | 'FORT'
export type GutTraining = 'AUCUN' | 'PARTIEL' | 'ENTRAINE'

export interface FuelingInput {
  durationH: number
  temperatureC: number
  weightKg: number
  sweat: SweatProfile
  gut: GutTraining
}

export interface FuelingHour {
  hour: number
  carbsG: number
  fluidMl: number
  sodiumMg: number
  suggestion: string
}

export interface FuelingPlan {
  carbsPerHourG: number
  fluidPerHourMl: number
  sodiumPerHourMg: number
  caffeineMg: number
  totals: { carbsG: number; fluidL: number; sodiumMg: number }
  hours: FuelingHour[]
  advice: string[]
}

const CARBS_BY_GUT: Record<GutTraining, number> = { AUCUN: 60, PARTIEL: 75, ENTRAINE: 90 }
const SODIUM_BY_SWEAT: Record<SweatProfile, number> = { FAIBLE: 500, MOYEN: 600, FORT: 700 }

/**
 * Plan de ravitaillement heure par heure. Repères : 60-90 g de glucides/h (jusqu'à 120 g
 * si l'intestin est entraîné), 500-700 mg de sodium par litre bu (ISSN), boisson à la soif
 * modulée par la chaleur. Au-delà de 6 h, on alterne sucré et salé pour limiter l'écœurement.
 */
export function computeFuelingPlan(input: FuelingInput): FuelingPlan {
  assertDomain(input.durationH > 0 && input.durationH <= 72, 'Durée entre 0 et 72 h')
  assertDomain(input.weightKg >= 35 && input.weightKg <= 150, 'Poids entre 35 et 150 kg')

  const carbs = input.durationH < 1.5 ? 30 : CARBS_BY_GUT[input.gut]
  const heat = clamp((input.temperatureC - 15) / 15, 0, 1)
  const sweatBonus = input.sweat === 'FORT' ? 150 : input.sweat === 'FAIBLE' ? -100 : 0
  const fluid = Math.round((450 + heat * 300 + sweatBonus) * (input.weightKg / 70) / 50) * 50
  const sodiumPerLitre = SODIUM_BY_SWEAT[input.sweat] + Math.round(heat * 100)
  const sodium = Math.round((fluid / 1000) * sodiumPerLitre / 10) * 10
  const caffeine = input.durationH >= 6 ? Math.round(Math.min(3 * input.weightKg, 300) / 10) * 10 : 0

  const totalHours = Math.ceil(input.durationH)
  const hours: FuelingHour[] = Array.from({ length: totalHours }, (_, i) => {
    const fraction = Math.min(input.durationH - i, 1)
    return {
      hour: i + 1,
      carbsG: Math.round(carbs * fraction),
      fluidMl: Math.round(fluid * fraction),
      sodiumMg: Math.round(sodium * fraction),
      suggestion: suggestionFor(i, input),
    }
  })

  const advice = [
    'Commence à manger dans les 30 premières minutes, puis toutes les 20-30 min.',
    'Teste ce plan à l’identique lors de tes sorties longues : jamais de nouveauté le jour J.',
  ]
  if (input.gut === 'AUCUN') advice.push('Entraîne ton intestin : augmente de 10 g/h chaque semaine pendant les sorties longues.')
  if (heat > 0.5) advice.push('Chaleur : mouille casquette et nuque à chaque point d’eau, et augmente le sel.')
  if (input.durationH > 6) advice.push('Au-delà de 6 h, alterne sucré et salé pour éviter l’écœurement.')
  if (caffeine > 0) advice.push(`Caféine : ${caffeine} mg max, plutôt en 2e partie de course ou avant la nuit.`)

  return {
    carbsPerHourG: carbs,
    fluidPerHourMl: fluid,
    sodiumPerHourMg: sodium,
    caffeineMg: caffeine,
    totals: {
      carbsG: hours.reduce((s, h) => s + h.carbsG, 0),
      fluidL: Math.round(hours.reduce((s, h) => s + h.fluidMl, 0) / 100) / 10,
      sodiumMg: hours.reduce((s, h) => s + h.sodiumMg, 0),
    },
    hours,
    advice,
  }
}

function suggestionFor(hourIndex: number, input: FuelingInput): string {
  if (hourIndex === 0) return 'Boisson isotonique + ½ barre maison'
  const salty = input.durationH > 6 && hourIndex >= 5 && hourIndex % 2 === 1
  if (salty) return hourIndex >= 10 ? 'Bouillon salé + rice cake salé' : 'Rice cake salé + boisson'
  const rotation = ['Pâte de fruits maison + boisson', 'Barre dattes-cajou + eau', 'Gel maison + boisson', 'Purée patate douce en gourde']
  return rotation[hourIndex % rotation.length]!
}
