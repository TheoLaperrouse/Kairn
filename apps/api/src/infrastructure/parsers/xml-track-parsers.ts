import type { ActivityFileParser } from '../../application/ports'
import {
  cumulativeGain,
  downsampleProfile,
  haversineKm,
  resampleTrack,
  sportFromLabel,
  type ImportedActivity,
} from '../../domain/activity/activity'
import { fileExternalId, gpxTrackPoints, parseXml, round2, type XmlNode } from './parser-utils'

interface TrackPoint {
  lat?: number
  lon?: number
  ele?: number
  time?: string
  hr?: number
  /** Cumulative distance supplied by the device (TCX), in metres. */
  distanceM?: number
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === 'object' && value !== null ? Number((value as { Value?: unknown }).Value) : Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** Builds an activity from a track: distance, smoothed elevation gain, duration, HR. */
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
  const profile = points.map((p, i) => ({ distanceKm: round2(cumulative[i]!), altitudeM: Math.round(p.ele ?? 0) }))

  const instants = points.map((p) => (p.time ? Date.parse(p.time) : NaN))
  const times = instants.filter(Number.isFinite)
  const heartRates = points.map((p) => p.hr).filter((hr): hr is number => hr !== undefined && hr > 0)
  const sport = sportFromLabel(meta.sportLabel)
  const samples = resampleTrack(
    points.flatMap((p, i) => (Number.isFinite(instants[i]) ? [{ t: instants[i]! / 1000, d: cumulative[i], alt: p.ele, hr: p.hr }] : [])),
  )
  return {
    source: meta.source,
    externalId: fileExternalId(meta.source.toLowerCase(), meta.content),
    sport,
    name: meta.name?.trim() || (sport === 'BIKE' ? 'Vélo' : 'Sortie trail'),
    startTime: new Date(times[0] ?? Date.now()).toISOString(),
    durationSec: times.length >= 2 ? Math.round((times.at(-1)! - times[0]!) / 1000) : 0,
    distanceKm: round2(distanceKm),
    elevationGainM: cumulativeGain(points.map((p) => p.ele).filter((e): e is number => e !== undefined)),
    avgHeartRate: heartRates.length ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : undefined,
    maxHeartRate: heartRates.length ? Math.max(...heartRates) : undefined,
    profile: downsampleProfile(profile.filter((p) => p.altitudeM !== 0)),
    samples,
  }
}

export class GpxActivityParser implements ActivityFileParser {
  readonly extension = '.gpx'

  async parse(content: Buffer): Promise<ImportedActivity> {
    const track = ((parseXml(content).gpx as XmlNode | undefined)?.trk as XmlNode[] | undefined)?.[0]
    if (!track) throw new Error('Aucune trace (<trk>) dans le fichier GPX')
    const points: TrackPoint[] = gpxTrackPoints([track]).map((p) => {
      const ext = (p.extensions as Record<string, XmlNode> | undefined)?.TrackPointExtension
      return { lat: asNumber(p.lat), lon: asNumber(p.lon), ele: asNumber(p.ele), time: p.time as string, hr: asNumber(ext?.hr) }
    })
    return fromTrack(points, { source: 'GPX', sportLabel: String(track.type ?? 'run'), name: track.name as string | undefined, content })
  }
}

export class TcxActivityParser implements ActivityFileParser {
  readonly extension = '.tcx'

  async parse(content: Buffer): Promise<ImportedActivity> {
    const activities = ((parseXml(content).TrainingCenterDatabase as XmlNode | undefined)?.Activities as XmlNode | undefined)?.Activity
    const activity = (activities as XmlNode[] | undefined)?.[0]
    if (!activity) throw new Error('Aucune activité dans le fichier TCX')
    const trackpoints = ((activity.Lap as XmlNode[] | undefined) ?? [])
      .flatMap((lap) => (lap.Track as XmlNode[] | undefined) ?? [])
      .flatMap((track) => (track.Trackpoint as XmlNode[] | undefined) ?? [])
    const points: TrackPoint[] = trackpoints.map((p) => {
      const position = p.Position as XmlNode | undefined
      return {
        lat: asNumber(position?.LatitudeDegrees),
        lon: asNumber(position?.LongitudeDegrees),
        ele: asNumber(p.AltitudeMeters),
        time: p.Time as string,
        hr: asNumber(p.HeartRateBpm),
        distanceM: asNumber(p.DistanceMeters),
      }
    })
    return fromTrack(points, { source: 'TCX', sportLabel: activity.Sport as string | undefined, content })
  }
}
