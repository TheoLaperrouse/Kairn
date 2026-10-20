import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'

export type XmlNode = Record<string, unknown>

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  isArray: (name) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept', 'wpt', 'Activity', 'Lap', 'Track', 'Trackpoint'].includes(name),
})

/** GPX and TCX: flat attributes, no namespaces, repeatable elements always as arrays. */
export function parseXml(content: Buffer): XmlNode {
  return xml.parse(content.toString('utf8')) as XmlNode
}

/** `trkpt` points from every track and segment of a GPX. */
export function gpxTrackPoints(tracks: XmlNode[]): XmlNode[] {
  return tracks.flatMap((t) => ((t.trkseg as XmlNode[] | undefined) ?? []).flatMap((seg) => (seg.trkpt as XmlNode[] | undefined) ?? []))
}

/** Stable id of an imported file: importing it again is recognised as a duplicate. */
export function fileExternalId(prefix: string, content: Buffer): string {
  return `${prefix}:${createHash('sha1').update(content).digest('hex')}`
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}
