import { describe, expect, it } from 'vitest'
import { EXERCISES } from '../../src/infrastructure/catalog/exercises'
import { RECIPES } from '../../src/infrastructure/catalog/recipes'
import { ROUTINES } from '../../src/infrastructure/catalog/routines'

describe('catalogue éditorial', () => {
  it('a des identifiants uniques', () => {
    for (const list of [EXERCISES, ROUTINES, RECIPES]) {
      const ids = list.map((item) => item.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('ne référence que des exercices existants dans les routines', () => {
    const ids = new Set(EXERCISES.map((e) => e.id))
    for (const routine of ROUTINES) {
      for (const block of routine.blocks) expect(ids, `${routine.id} → ${block.exerciseId}`).toContain(block.exerciseId)
    }
  })

  it('couvre chaque phase avant la course par au moins une routine', () => {
    for (const phase of ['FONCIER', 'DEVELOPPEMENT', 'SPECIFIQUE', 'AFFUTAGE', 'COURSE'] as const) {
      expect(ROUTINES.some((r) => r.phases.includes(phase)), phase).toBe(true)
    }
  })

  it('anime chaque exercice avec au moins deux poses-clés', () => {
    for (const exercise of EXERCISES) expect(exercise.animation.keyframes.length, exercise.id).toBeGreaterThanOrEqual(2)
  })

  it('propose des recettes dans chaque catégorie avec des macros cohérentes', () => {
    for (const category of ['VEILLE', 'AVANT', 'PENDANT', 'BOISSON', 'APRES'] as const) {
      expect(RECIPES.some((r) => r.category === category), category).toBe(true)
    }
    for (const recipe of RECIPES) {
      const { kcal, carbsG, proteinG, fatG } = recipe.perServing
      const computed = carbsG * 4 + proteinG * 4 + fatG * 9
      expect(Math.abs(computed - kcal) / Math.max(kcal, 1), recipe.id).toBeLessThan(0.25)
    }
  })
})
