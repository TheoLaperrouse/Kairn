import { XMLParser } from 'fast-xml-parser'
import type { CourseFile, CourseFileParser } from '../../application/ports'
import type { TrackPoint } from '../../domain/race-course/race-course'

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept', 'wpt'].includes(name),
})

type Node = Record<string, unknown>

function toPoint(node: Node): TrackPoint | undefined {
  const lat = Number(node.lat)
  const lon = Number(node.lon)
  const ele = Number(node.ele)
  return Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(ele) ? { lat, lon, ele } : undefined
}

/**
 * GPX officiel d'une course : tracé (`trk` ou `rte`) et points remarquables (`wpt`),
 * que les organisateurs utilisent pour les ravitaillements et bases de vie.
 */
export class GpxCourseParser implements CourseFileParser {
  parse(content: Buffer): CourseFile {
    const gpx = xml.parse(content.toString('utf8')).gpx as Node | undefined
    if (!gpx) throw new Error('Fichier GPX invalide')

    const tracks = (gpx.trk as Node[] | undefined) ?? []
    const routes = (gpx.rte as Node[] | undefined) ?? []
    const nodes: Node[] = tracks.length
      ? tracks.flatMap((t) => ((t.trkseg as Node[] | undefined) ?? []).flatMap((seg) => (seg.trkpt as Node[] | undefined) ?? []))
      : routes.flatMap((r) => (r.rtept as Node[] | undefined) ?? [])
    const track = nodes.map(toPoint).filter((p): p is TrackPoint => p !== undefined)
    if (track.length < 10) throw new Error('Le GPX ne contient pas de tracé avec altitude exploitable')

    const name = String(tracks[0]?.name ?? routes[0]?.name ?? (gpx.metadata as Node | undefined)?.name ?? '').trim()
    const waypoints = ((gpx.wpt as Node[] | undefined) ?? [])
      .map((w) => ({ name: String(w.name ?? w.desc ?? '').trim(), lat: Number(w.lat), lon: Number(w.lon) }))
      .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon))

    return { name, track, waypoints }
  }
}
