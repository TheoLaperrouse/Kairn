export type RecipeCategory =
  | 'VEILLE' // charge glucidique la veille / les jours précédents
  | 'AVANT' // petit-déjeuner / repas pré-effort
  | 'PENDANT' // à emporter dans le sac / sur les ravitos
  | 'BOISSON' // boissons d'effort et de récupération
  | 'APRES' // récupération

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
  /** Phrase courte : quand et pourquoi la consommer. */
  moment: string
  prepMinutes: number
  servings: number
  /** Ce que représente une portion, ex. "1 barre de 40 g". */
  servingLabel: string
  ingredients: Ingredient[]
  steps: string[]
  perServing: Macros
  tags: string[]
  tip: string
  storage: string
  emoji: string
}
