import { computeFuelingPlan, type FuelingInput, type FuelingPlan } from '../../domain/nutrition/race-fueling'
import type { Recipe } from '../../domain/nutrition/recipe'
import { NotFoundError } from '../../domain/shared/errors'
import type { Exercise } from '../../domain/strength/exercise'
import type { StrengthRoutine } from '../../domain/strength/routine'
import type { ContentCatalog } from '../ports'

export interface RoutineDetail extends StrengthRoutine {
  exercises: Exercise[]
}

export class ContentService {
  constructor(private readonly catalog: ContentCatalog) {}

  exercises(): Exercise[] {
    return this.catalog.exercises()
  }

  exercise(id: string): Exercise {
    const exercise = this.catalog.exercises().find((e) => e.id === id)
    if (!exercise) throw new NotFoundError('Exercice', id)
    return exercise
  }

  routines(): StrengthRoutine[] {
    return this.catalog.routines()
  }

  /** Routine accompagnée des exercices qu'elle référence, pour le lecteur de séance guidée. */
  routine(id: string): RoutineDetail {
    const routine = this.catalog.routines().find((r) => r.id === id)
    if (!routine) throw new NotFoundError('Routine', id)
    const ids = new Set(routine.blocks.map((b) => b.exerciseId))
    return { ...routine, exercises: this.catalog.exercises().filter((e) => ids.has(e.id)) }
  }

  recipes(): Recipe[] {
    return this.catalog.recipes()
  }

  fuelingPlan(input: FuelingInput): FuelingPlan {
    return computeFuelingPlan(input)
  }
}
