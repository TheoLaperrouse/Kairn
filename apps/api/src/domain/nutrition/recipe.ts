export type RecipeCategory =
  | 'DAY_BEFORE' // carb loading the day before / the previous days
  | 'BEFORE' // breakfast / pre-exercise meal
  | 'DURING' // to carry in the pack / at aid stations
  | 'DRINK' // exercise and recovery drinks
  | 'AFTER' // recovery

export interface Ingredient {
  name: string
  quantity: number
  unit: string
}

export interface Macros {
  kcal: number
  carbsG: number
  proteinG: number
  fatG: number
  sodiumMg: number
}

export interface Recipe {
  id: string
  name: string
  category: RecipeCategory
  /** Short sentence: when and why to eat it. */
  moment: string
  prepMinutes: number
  servings: number
  /** What one serving is, e.g. "1 barre de 40 g". */
  servingLabel: string
  ingredients: Ingredient[]
  steps: string[]
  perServing: Macros
  tags: string[]
  tip: string
  storage: string
  emoji: string
}
