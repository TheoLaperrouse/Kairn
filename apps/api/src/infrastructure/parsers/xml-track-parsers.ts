import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import type { ActivityFileParser } from '../../application/ports'
import {
  cumulativeGain,
  downsampleProfile,
  haversineKm,
  resampleTrack,
  sportFromLabel,
  type ImportedActivity,
} from '../../domain/activity/activity'

interface TrackPoint {
  lat?: number
  lon?: number
  ele?: number
  time?: string
  hr?: number
  /** Distance cumulée fournie par l'appareil (TCX), en mètres. */
  distanceM?: number
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => ['trk', 'trkseg', 'trkpt', 'Activity', 'Lap', 'Track', 'Trackpoint'].includes(name),
})

function asNumber(value: unknown): number | undefined {
  const n = typeof value === 'object' && value !== null ? Number((value as { Value?: unknown }).Value) : Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** Construit une activité à partir d'une trace : distance, D+ lissé, durée, FC. */
function fromTrack(points: TrackPoint[], meta: { source: 'GPX' | 'TCX'; sportLabel?: string; name?: string; content: Buffer }): ImportedActivity {
  if (points.length < 2) throw new Error('La trace contient moins de deux points')
  let distanceKm = 0
  const cumulative = points.map((p, i) => {
    const prev = points[i - 1]
    if (p.distanceM !== undefined) distanceKm = p.distanceM / 1000
    else if (prev?.lat !== undefined && prev.lon !== undefined && p.lat !== undefined && p.lon !== undefined) {
      distanceKm += haversineKm(prev.lat, prev.lon, p.lat, p.lon)
    }
    return distanceKm
  })
  const profile = points.map((p, i) => ({ distanceKm: Math.round(cumulative[i]! * 100) / 100, altitudeM: Math.round(p.ele ?? 0) }))

  const times = points.map((p) => (p.time ? Date.parse(p.time) : NaN)).filter(Number.isFinite)
  const heartRates = points.map((p) => p.hr).filter((hr): hr is number => hr !== undefined && hr > 0)
  const sport = sportFromLabel(meta.sportLabel)
  const samples = resampleTrack(
    points.flatMap((p, i) => {
      const time = p.time ? Date.parse(p.time) : NaN
      return Number.isFinite(time) ? [{ t: time / 1000, d: cumulative[i], alt: p.ele, hr: p.hr }] : []
    }),
  )
  return {
    source: meta.source,
    externalId: `${meta.source.toLowerCase()}:${createHash('sha1').update(meta.content).digest('hex')}`,
    sport,
    name: meta.name?.trim() || (sport === 'BIKE' ? 'Vélo' : 'Sortie trail'),
    startTime: new Date(times[0] ?? Date.now()).toISOString(),
    durationSec: times.length >= 2 ? Math.round((times.at(-1)! - times[0]!) / 1000) : 0,
    distanceKm: Math.round(distanceKm * 100) / 100,
    elevationGainM: cumulativeGain(points.map((p) => p.ele).filter((e): e is number => e !== undefined)),
    avgHeartRate: heartRates.length ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : undefined,
    maxHeartRate: heartRates.length ? Math.max(...heartRates) : undefined,
    profile: downsampleProfile(profile.filter((p) => p.altitudeM !== 0)),
    samples,
  }
}

export class GpxActivityParser implements ActivityFileParser {
  supports(filename: string): boolean {
    return filename.toLowerCase().endsWith('.gpx')
  }

  async parse(content: Buffer): Promise<ImportedActivity> {
    const doc = xml.parse(content.toString('utf8'))
    const track = doc.gpx?.trk?.[0]
    if (!track) throw new Error('Aucune trace (<trk>) dans le fichier GPX')
    const points: TrackPoint[] = (track.trkseg ?? []).flatMap((seg: { trkpt?: unknown[] }) =>
      (seg.trkpt ?? []).map((pt) => {
        const p = pt as Record<string, unknown>
        const ext = (p.extensions as Record<string, Record<string, unknown>> | undefined)?.TrackPointExtension
        return { lat: asNumber(p.lat), lon: asNumber(p.lon), ele: asNumber(p.ele), time: p.time as string, hr: asNumber(ext?.hr) }
      }),
    )
    return fromTrack(points, { source: 'GPX', sportLabel: String(track.type ?? 'run'), name: track.name, content })
  }
}

export class TcxActivityParser implements ActivityFileParser {
  supports(filename: string): boolean {
    return filename.toLowerCase().endsWith('.tcx')
  }

  async parse(content: Buffer): Promise<ImportedActivity> {
    const doc = xml.parse(content.toString('utf8'))
    const activity = doc.TrainingCenterDatabase?.Activities?.Activity?.[0]
    if (!activity) throw new Error('Aucune activité dans le fichier TCX')
    const points: TrackPoint[] = (activity.Lap ?? []).flatMap((lap: { Track?: Array<{ Trackpoint?: unknown[] }> }) =>
      (lap.Track ?? []).flatMap((t) =>
        (t.Trackpoint ?? []).map((tp) => {
          const p = tp as Record<string, unknown>
          const pos = p.Position as Record<string, unknown> | undefined
          return {
            lat: asNumber(pos?.LatitudeDegrees),
            lon: asNumber(pos?.LongitudeDegrees),
            ele: asNumber(p.AltitudeMeters),
            time: p.Time as string,
            hr: asNumber(p.HeartRateBpm),
            distanceM: asNumber(p.DistanceMeters),
          }
        }),
      ),
    )
    return fromTrack(points, { source: 'TCX', sportLabel: activity.Sport, content })
  }
}
