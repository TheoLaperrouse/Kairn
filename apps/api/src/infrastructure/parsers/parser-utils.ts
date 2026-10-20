import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'

export type XmlNode = Record<string, unknown>

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept', 'wpt', 'Activity', 'Lap', 'Track', 'Trackpoint'].includes(name),
})

/** GPX et TCX : attributs à plat, sans espaces de noms, éléments répétables toujours en tableau. */
export function parseXml(content: Buffer): XmlNode {
  return xml.parse(content.toString('utf8')) as XmlNode
}

/** Points `trkpt` de toutes les traces et segments d'un GPX. */
export function gpxTrackPoints(tracks: XmlNode[]): XmlNode[] {
  return tracks.flatMap((t) => ((t.trkseg as XmlNode[] | undefined) ?? []).flatMap((seg) => (seg.trkpt as XmlNode[] | undefined) ?? []))
}

/** Identifiant stable d'un fichier importé : le réimporter est reconnu comme un doublon. */
export function fileExternalId(prefix: string, content: Buffer): string {
  return `${prefix}:${createHash('sha1').update(content).digest('hex')}`
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}
