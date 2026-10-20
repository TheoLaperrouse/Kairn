import type { ContentCatalog } from '../../application/ports'
import { EXERCISES } from './exercises'
import { RECIPES } from './recipes'
import { ROUTINES } from './routines'

/** Editorial content versioned with the code (exercises, routines, recipes). */
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
