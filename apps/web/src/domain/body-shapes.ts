/**
 * Rendu anatomique du personnage de démonstration.
 *
 * À partir du squelette (kinematics.ts), produit des formes vectorielles réalistes :
 * membres galbés (quadriceps, mollets, biceps), tronc avec cambrure lombaire et cage thoracique,
 * tête de profil, tenue de trail, chaussures, et zones musculaires qui s'allument à l'effort.
 *
 * Module pur, sans DOM ni dépendance : il est aussi embarqué tel quel dans les films Claude Motion
 * (compilé en IIFE), pour que l'app et les films montrent exactement le même athlète.
 */
import type { MuscleRegion } from './anatomy'
import type { Point, Skeleton } from './kinematics'

export type Layer = 'shadow' | 'far' | 'body' | 'near' | 'muscle' | 'detail'

export type Paint =
  | 'skin'
  | 'skinFar'
  | 'skinShade'
  | 'top'
  | 'topFar'
  | 'shorts'
  | 'shortsFar'
  | 'shoe'
  | 'shoeFar'
  | 'sole'
  | 'hair'
  | 'shadow'
  | 'muscle'
  | 'eye'

export interface BodyShape {
  layer: Layer
  paint: Paint
  /** Chemin SVG (repère du squelette, y vers le bas). */
  d: string
  /** Zone musculaire représentée (pour l'allumage et les étiquettes). */
  region?: MuscleRegion
  /** Centre de la zone, pour accrocher une étiquette. */
  anchor?: Point
}

/** Profil d'un segment : à l'abscisse s (0 → 1), demi-épaisseur côté avant et côté arrière. */
type Profile = Array<[s: number, front: number, back: number]>

// Profils calibrés sur des proportions d'athlète d'endurance (unité = longueur de cuisse ≈ 46 cm).
const THIGH: Profile = [
  [-0.04, 0.2, 0.22],
  [0.15, 0.225, 0.2],
  [0.4, 0.21, 0.18],
  [0.7, 0.165, 0.14],
  [0.9, 0.12, 0.11],
  [1.04, 0.105, 0.1],
]
const SHIN: Profile = [
  [-0.02, 0.095, 0.105],
  [0.15, 0.08, 0.14],
  [0.32, 0.075, 0.15],
  [0.55, 0.062, 0.11],
  [0.82, 0.05, 0.065],
  [1.0, 0.05, 0.055],
]
const UPPER_ARM: Profile = [
  [-0.08, 0.095, 0.1],
  [0.25, 0.088, 0.092],
  [0.55, 0.08, 0.075],
  [0.9, 0.058, 0.056],
  [1.04, 0.052, 0.05],
]
const FOREARM: Profile = [
  [-0.04, 0.052, 0.055],
  [0.25, 0.066, 0.063],
  [0.7, 0.046, 0.045],
  [1.0, 0.036, 0.036],
]
/** Tronc, du bassin (0) au cou (1) ; « front » = ventre/poitrine, « back » = dos. */
const TORSO: Profile = [
  [-0.12, 0.14, 0.17],
  [0.0, 0.17, 0.2],
  [0.12, 0.165, 0.2],
  [0.3, 0.15, 0.13],
  [0.5, 0.155, 0.14],
  [0.72, 0.19, 0.17],
  [0.88, 0.16, 0.16],
  [1.0, 0.07, 0.08],
]
const NECK: Profile = [
  [0, 0.06, 0.065],
  [1, 0.055, 0.06],
]

const QUAD: Profile = [
  [0.12, 0.2, -0.02],
  [0.45, 0.2, -0.01],
  [0.85, 0.12, -0.03],
]
const HAMSTRING: Profile = [
  [0.1, -0.02, 0.19],
  [0.5, -0.01, 0.165],
  [0.88, -0.03, 0.095],
]
const CALF: Profile = [
  [0.08, -0.02, 0.125],
  [0.3, -0.01, 0.145],
  [0.6, -0.02, 0.095],
]
const ABS: Profile = [
  [0.08, 0.15, -0.04],
  [0.4, 0.14, -0.05],
  [0.66, 0.16, -0.05],
]
const ERECTORS: Profile = [
  [0.08, -0.06, 0.15],
  [0.4, -0.05, 0.125],
  [0.68, -0.07, 0.15],
]
const GLUTE: Profile = [
  [-0.1, -0.06, 0.18],
  [0.06, -0.04, 0.2],
  [0.2, -0.06, 0.17],
]
const DELTOID: Profile = [
  [-0.12, 0.085, 0.085],
  [0.2, 0.08, 0.08],
  [0.42, 0.04, 0.04],
]

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k })
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString()

/** Courbe fermée lissée (Catmull-Rom → Bézier cubiques) passant par les points. */
function smoothClosed(points: Point[]): string {
  const n = points.length
  const p = (i: number) => points[((i % n) + n) % n]!
  let d = `M${fmt(p(0).x)},${fmt(p(0).y)}`
  for (let i = 0; i < n; i++) {
    const c1 = add(p(i), scale(sub(p(i + 1), p(i - 1)), 1 / 6))
    const c2 = sub(p(i + 1), scale(sub(p(i + 2), p(i)), 1 / 6))
    d += `C${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(p(i + 1).x)},${fmt(p(i + 1).y)}`
  }
  return `${d}Z`
}

/**
 * Contour d'un segment de A à B selon un profil. `anteriorSign` oriente le côté « avant »
 * (+1 pour les segments pendants : jambes, bras ; −1 pour le tronc, orienté vers le haut).
 */
function outline(a: Point, b: Point, profile: Profile, anteriorSign: 1 | -1, from = -Infinity, to = Infinity): Point[] {
  const dir = sub(b, a)
  const length = Math.hypot(dir.x, dir.y) || 1e-6
  const u = scale(dir, 1 / length)
  const n = scale({ x: u.y, y: -u.x }, anteriorSign)
  const rows = profile.filter(([s]) => s >= from && s <= to)
  const front = rows.map(([s, f]) => add(lerp(a, b, s), scale(n, f)))
  const back = rows.map(([s, , bk]) => add(lerp(a, b, s), scale(n, -bk))).reverse()
  // Extrémités arrondies : un point au-delà de chaque bout du segment.
  const first = rows[0]!
  const last = rows.at(-1)!
  const capEnd = add(lerp(a, b, last[0]), add(scale(u, (last[1] + last[2]) * 0.45), scale(n, (last[1] - last[2]) / 2)))
  const capStart = add(lerp(a, b, first[0]), add(scale(u, -(first[1] + first[2]) * 0.45), scale(n, (first[1] - first[2]) / 2)))
  return [capStart, ...front, capEnd, ...back]
}

function shape(layer: Layer, paint: Paint, points: Point[], extra: Partial<BodyShape> = {}): BodyShape {
  return { layer, paint, d: smoothClosed(points), ...extra }
}

/** Chaussure de trail : semelle crantée, tige, orientée selon le pied. */
function shoe(ankle: Point, toe: Point, far: boolean): BodyShape[] {
  const u = sub(toe, ankle)
  const length = Math.hypot(u.x, u.y) || 1e-6
  const dir = scale(u, 1 / length)
  // « Haut » du pied : perpendiculaire orientée vers le tibia.
  const up = { x: dir.y, y: -dir.x }
  const at = (along: number, height: number) => add(add(ankle, scale(dir, along)), scale(up, height))
  const upper = [at(-0.09, 0.02), at(-0.07, 0.1), at(0.05, 0.085), at(0.2, 0.05), at(0.32, 0.02), at(0.34, -0.03), at(0.2, -0.05), at(-0.08, -0.05)]
  const sole = [at(-0.1, -0.04), at(0.34, -0.035), at(0.35, -0.065), at(-0.1, -0.075)]
  return [shape(far ? 'far' : 'near', far ? 'shoeFar' : 'shoe', upper), shape(far ? 'far' : 'near', 'sole', sole)]
}

function hand(wrist: Point, elbow: Point, layer: Layer, paint: Paint): BodyShape {
  const dir = sub(wrist, elbow)
  const length = Math.hypot(dir.x, dir.y) || 1e-6
  const u = scale(dir, 1 / length)
  const n = { x: u.y, y: -u.x }
  const at = (along: number, side: number) => add(add(wrist, scale(u, along)), scale(n, side))
  return shape(layer, paint, [at(-0.02, 0.035), at(0.06, 0.045), at(0.13, 0.025), at(0.14, -0.01), at(0.07, -0.04), at(-0.02, -0.032)])
}

function head(neck: Point, center: Point): BodyShape[] {
  const dir = sub(center, neck)
  const length = Math.hypot(dir.x, dir.y) || 1e-6
  const up = scale(dir, 1 / length)
  // Visage vers l'avant (+x quand la tête est droite).
  const fwd = { x: -up.y, y: up.x }
  const at = (f: number, u: number) => add(add(center, scale(fwd, f)), scale(up, u))
  const skull = [
    at(-0.19, 0.02),
    at(-0.15, 0.17),
    at(0.0, 0.25),
    at(0.14, 0.18),
    at(0.19, 0.06),
    at(0.215, -0.02), // nez
    at(0.18, -0.06),
    at(0.17, -0.12), // menton
    at(0.08, -0.2),
    at(-0.06, -0.16),
    at(-0.17, -0.1),
  ]
  const hair = [at(-0.2, 0.0), at(-0.17, 0.18), at(0.0, 0.265), at(0.15, 0.19), at(0.12, 0.13), at(-0.02, 0.15), at(-0.1, 0.06)]
  const ear = [at(-0.03, 0.03), at(0.0, 0.05), at(0.02, 0.0), at(-0.01, -0.04), at(-0.04, -0.01)]
  const eye = [at(0.12, 0.045), at(0.135, 0.05), at(0.14, 0.035), at(0.125, 0.03)]
  return [
    shape('body', 'skin', skull),
    shape('body', 'hair', hair),
    shape('detail', 'skinShade', ear),
    shape('detail', 'eye', eye),
  ]
}

/** Point moyen d'un profil, pour accrocher l'étiquette d'un muscle. */
function anchorOf(a: Point, b: Point, profile: Profile, anteriorSign: 1 | -1): Point {
  const pts = outline(a, b, profile, anteriorSign)
  return scale(pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 }), 1 / pts.length)
}

export function bodyShapes(s: Skeleton, regions: MuscleRegion[]): BodyShape[] {
  const shapes: BodyShape[] = []
  const { near, far, hip, neck } = s
  const shoulder = lerp(neck, hip, 0.1)

  // Ombre portée au sol (y = 0), proportionnelle à l'emprise du corps.
  const xs = [hip.x, neck.x, near.toe.x, far.toe.x, near.ankle.x, far.ankle.x, near.wrist.x, far.wrist.x]
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const lift = Math.max(0, -Math.max(near.ankle.y, far.ankle.y, near.toe.y, far.toe.y, near.knee.y, far.knee.y, near.wrist.y, far.wrist.y, hip.y))
  const rx = (maxX - minX) / 2 + 0.25
  const ry = Math.max(0.03, 0.06 - lift * 0.04)
  const cx = (minX + maxX) / 2
  shapes.push({
    layer: 'shadow',
    paint: 'shadow',
    d: `M${fmt(cx - rx)},0 A${fmt(rx)},${fmt(ry)} 0 1 0 ${fmt(cx + rx)},0 A${fmt(rx)},${fmt(ry)} 0 1 0 ${fmt(cx - rx)},0Z`,
  })

  // Côté éloigné (dans l'ombre).
  shapes.push(shape('far', 'skinFar', outline(shoulder, far.elbow, UPPER_ARM, 1)))
  shapes.push(shape('far', 'skinFar', outline(far.elbow, far.wrist, FOREARM, 1)))
  shapes.push(hand(far.wrist, far.elbow, 'far', 'skinFar'))
  shapes.push(shape('far', 'skinFar', outline(far.knee, far.ankle, SHIN, 1)))
  shapes.push(shape('far', 'skinFar', outline(hip, far.knee, THIGH, 1)))
  shapes.push(shape('far', 'shortsFar', outline(hip, far.knee, THIGH.map(([t, f, b]) => [t, f + 0.012, b + 0.012]), 1, -1, 0.42)))
  shapes.push(...shoe(far.ankle, far.toe, true))

  // Tronc, cou, tête, tenue.
  shapes.push(shape('body', 'skin', outline(neck, add(neck, scale(sub(s.head, neck), 0.55)), NECK, 1)))
  shapes.push(shape('body', 'skin', outline(hip, neck, TORSO, -1)))
  shapes.push(shape('body', 'shorts', outline(hip, neck, TORSO.map(([t, f, b]) => [t, f + 0.012, b + 0.012]), -1, -1, 0.14)))
  shapes.push(shape('body', 'top', outline(hip, neck, TORSO.map(([t, f, b]) => [t, f + 0.01, b + 0.01]), -1, 0.12, 0.9)))
  shapes.push(...head(neck, s.head))

  // Côté proche.
  shapes.push(shape('near', 'skin', outline(near.knee, near.ankle, SHIN, 1)))
  shapes.push(shape('near', 'skin', outline(hip, near.knee, THIGH, 1)))
  shapes.push(shape('near', 'shorts', outline(hip, near.knee, THIGH.map(([t, f, b]) => [t, f + 0.014, b + 0.014]), 1, -1, 0.42)))
  shapes.push(...shoe(near.ankle, near.toe, false))
  shapes.push(shape('near', 'skin', outline(shoulder, near.elbow, UPPER_ARM, 1)))
  shapes.push(shape('near', 'skin', outline(near.elbow, near.wrist, FOREARM, 1)))
  shapes.push(hand(near.wrist, near.elbow, 'near', 'skin'))

  // Muscles sollicités, côté proche (et fessiers / dos sur le tronc).
  const muscle = (region: MuscleRegion, a: Point, b: Point, profile: Profile, sign: 1 | -1) =>
    shapes.push(shape('muscle', 'muscle', outline(a, b, profile, sign), { region, anchor: anchorOf(a, b, profile, sign) }))
  for (const region of regions) {
    if (region === 'QUADRICEPS') muscle(region, hip, near.knee, QUAD, 1)
    if (region === 'ISCHIOS') muscle(region, hip, near.knee, HAMSTRING, 1)
    if (region === 'MOLLETS') muscle(region, near.knee, near.ankle, CALF, 1)
    if (region === 'CHEVILLES') muscle(region, near.knee, near.ankle, [[0.72, 0.05, 0.06], [0.9, 0.05, 0.055], [1.02, 0.05, 0.05]], 1)
    if (region === 'ABDOS') muscle(region, hip, neck, ABS, -1)
    if (region === 'DOS') muscle(region, hip, neck, ERECTORS, -1)
    if (region === 'FESSIERS') muscle(region, hip, neck, GLUTE, -1)
    if (region === 'EPAULES') muscle(region, shoulder, near.elbow, DELTOID, 1)
  }
  return shapes
}

/** Palette de rendu (peau, tenue) — indépendante du thème clair/sombre de l'app. */
export const BODY_PALETTE: Record<Paint, string> = {
  skin: '#e2a982',
  skinFar: '#b97c5c',
  skinShade: '#c98d6a',
  top: '#2f6f8f',
  topFar: '#24566f',
  shorts: '#1c2433',
  shortsFar: '#151b27',
  shoe: '#f28c38',
  shoeFar: '#b8642a',
  sole: '#eef1f4',
  hair: '#3a2a20',
  shadow: 'rgba(0, 0, 0, 0.28)',
  muscle: '#ff6b2c',
  eye: '#2a1d16',
}
