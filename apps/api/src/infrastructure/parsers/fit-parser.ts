import FitParser from 'fit-file-parser'
import type { ActivityFileParser } from '../../application/ports'
import { downsampleProfile, resampleTrack, sportFromLabel, type ImportedActivity, type ProfilePoint } from '../../domain/activity/activity'
import { fileExternalId, round2 } from './parser-utils'

/**
 * Fichiers .FIT natifs des montres Garmin (et Coros, Suunto, Wahoo…).
 * On lit le message « session » pour les totaux, et les « records » pour le profil.
 */
export class FitActivityParser implements ActivityFileParser {
  readonly extension = '.fit'

  async parse(content: Buffer, filename: string): Promise<ImportedActivity> {
    const parser = new FitParser({ force: true, lengthUnit: 'm', speedUnit: 'km/h', mode: 'list' })
    const fit = await parser.parseAsync(content as Buffer<ArrayBuffer>)
    const session = fit.sessions?.[0]
    if (!session) throw new Error('Aucune session trouvée dans le fichier FIT')

    const records = fit.records ?? []
    const profile: ProfilePoint[] = records
      .filter((r) => typeof r.altitude === 'number' && typeof r.distance === 'number')
      .map((r) => ({ distanceKm: round2(r.distance! / 1000), altitudeM: Math.round(r.altitude!) }))

    const samples = resampleTrack(
      records
        .filter((r) => r.timestamp)
        .map((r) => {
          const record = r as typeof r & { enhanced_altitude?: number }
          return {
            t: Date.parse(String(r.timestamp)) / 1000,
            d: typeof r.distance === 'number' ? r.distance / 1000 : undefined,
            alt: record.enhanced_altitude ?? r.altitude,
            hr: r.heart_rate,
          }
        }),
    )

    const sport = sportFromLabel(`${session.sport ?? ''} ${session.sub_sport ?? ''}`)
    const startTime = new Date(session.start_time as unknown as string | Date).toISOString()
    return {
      source: 'FIT',
      externalId: fileExternalId('fit', content),
      sport,
      name: activityName(sport, session.sub_sport, filename),
      startTime,
      durationSec: Math.round(session.total_timer_time ?? session.total_elapsed_time ?? 0),
      distanceKm: round2((session.total_distance ?? 0) / 1000),
      elevationGainM: Math.round(session.total_ascent ?? 0),
      avgHeartRate: session.avg_heart_rate,
      maxHeartRate: session.max_heart_rate,
      profile: downsampleProfile(profile),
      samples,
    }
  }
}

function activityName(sport: ImportedActivity['sport'], subSport: unknown, filename: string): string {
  if (sport === 'RUN') return String(subSport ?? '').includes('trail') ? 'Trail' : 'Course à pied'
  if (sport === 'BIKE') return 'Vélo'
  if (sport === 'STRENGTH') return 'Renforcement'
  return filename
}
