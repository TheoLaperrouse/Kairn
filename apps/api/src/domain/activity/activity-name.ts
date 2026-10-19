import type { PlannedSession } from '../plan/training-plan'
import type { Activity } from './activity'

/** Noms donnés par défaut par les montres, Strava (en anglais et en français) ou nos parseurs. */
const GENERIC_NAMES = [
  /^(morning|lunch|afternoon|evening|night) (run|trail run|ride|hike|walk|workout|weight training)$/i,
  /^(course à pied|sortie à vélo|vélo|trail|randonnée|marche|entraînement|musculation|renforcement|sortie trail|sortie)( (le matin|le midi|à l['’]heure du déjeuner|(dans )?l['’]après-midi|en soirée|le soir|la nuit))?$/i,
]

export function isGenericName(name: string): boolean {
  return GENERIC_NAMES.some((pattern) => pattern.test(name.trim()))
}

function kmLabel(km: number): string {
  return `${km >= 10 ? Math.round(km) : Math.round(km * 10) / 10} km`.replace('.', ',')
}

/** Nom lisible : le titre de la séance prévue, sinon une description tirée du profil de la sortie. */
export function suggestActivityName(activity: Pick<Activity, 'sport' | 'durationSec' | 'distanceKm' | 'elevationGainM'>, session?: PlannedSession): string {
  if (session) return session.title
  if (activity.sport === 'STRENGTH') return 'Renforcement'
  if (activity.sport === 'BIKE') return activity.distanceKm > 0 ? `Vélo · ${kmLabel(activity.distanceKm)}` : 'Vélo'
  const metersPerKm = activity.distanceKm > 0 ? activity.elevationGainM / activity.distanceKm : 0
  const terrain = metersPerKm >= 50 ? 'en montagne' : metersPerKm >= 20 ? 'vallonnée' : undefined
  const long = activity.durationSec >= 2 * 3600
  const base = long ? `Sortie longue${terrain ? ` ${terrain}` : ''}` : terrain ? `Sortie ${terrain}` : 'Footing'
  return activity.distanceKm > 0 ? `${base} · ${kmLabel(activity.distanceKm)}` : base
}
