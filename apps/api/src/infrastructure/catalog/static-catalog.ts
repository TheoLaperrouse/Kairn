import type { ContentCatalog } from '../../application/ports'
import { EXERCISES } from './exercises'
import { RECIPES } from './recipes'
import { ROUTINES } from './routines'

/** Contenu éditorial versionné avec le code (exercices, routines, recettes). */
export class StaticContentCatalog implements ContentCatalog {
  exercises() {
    return EXERCISES
  }

  routines() {
    return ROUTINES
  }

  recipes() {
    return RECIPES
  }
}
