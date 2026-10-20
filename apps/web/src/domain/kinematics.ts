import type { Pose, SceneProp } from './models'

/**
 * Kinematics of the demo figure (side view, facing +x, y pointing down).
 * Same model as the Claude Motion films: absolute angles, automatic grounding.
 */
const SEGMENT = {
  thigh: 1,
  shin: 1,
  torso: 1.3,
  upperArm: 0.65,
  forearm: 0.6,
  headRadius: 0.22,
  headOffset: 0.3,
  foot: 0.3,
} as const

export interface Point {
  x: number
  y: number
}

export interface Skeleton {
  hip: Point
  neck: Point
  head: Point
  near: Limbs
  far: Limbs
}

export interface Limbs {
  elbow: Point
  wrist: Point
  knee: Point
  ankle: Point
  toe: Point
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** "Hanging" segment: 0° = pointing down, positive = forward. */
function hang(from: Point, angle: number, length: number): Point {
  return { x: from.x + length * Math.sin(rad(angle)), y: from.y + length * Math.cos(rad(angle)) }
}

/**
 * Default foot angle: flat (90°) while the shin is near vertical (standing on the ground),
 * then a smooth transition to the shin's extension (+90°) when the leg is in the air or horizontal
 * (plank, rear leg of a lunge, knee drive). The transition avoids any jump during the animation.
 */
export function defaultFootAngle(shin: number): number {
  const t = Math.min(Math.max((Math.abs(shin) - 35) / 25, 0), 1)
  const smooth = t * t * (3 - 2 * t)
  return 90 + (shin + 90 - 90) * smooth
}

function limbs(
  neck: Point,
  hip: Point,
  upperArm: number,
  forearm: number,
  thigh: number,
  shin: number,
  foot: number | undefined,
): Limbs {
  const elbow = hang(neck, upperArm, SEGMENT.upperArm)
  const wrist = hang(elbow, forearm, SEGMENT.forearm)
  const knee = hang(hip, thigh, SEGMENT.thigh)
  const ankle = hang(knee, shin, SEGMENT.shin)
  const toe = hang(ankle, foot ?? defaultFootAngle(shin), SEGMENT.foot)
  return { elbow, wrist, knee, ankle, toe }
}

function build(pose: Pose, hip: Point): Skeleton {
  const t = rad(pose.torso)
  const neck = { x: hip.x + SEGMENT.torso * Math.sin(t), y: hip.y - SEGMENT.torso * Math.cos(t) }
  const headAngle = t + rad(pose.head ?? 0)
  const head = {
    x: neck.x + SEGMENT.headOffset * Math.sin(headAngle),
    y: neck.y - SEGMENT.headOffset * Math.cos(headAngle),
  }
  return {
    hip,
    neck,
    head,
    near: limbs(neck, hip, pose.nearUpperArm, pose.nearForearm, pose.nearThigh, pose.nearShin, pose.nearFoot),
    far: limbs(neck, hip, pose.farUpperArm, pose.farForearm, pose.farThigh, pose.farShin, pose.farFoot),
  }
}

/** Lowest point of the skeleton (the ground is at y = 0, positive y points down). */
/** Sole thickness below the ankle → toes line (same dimensions as the drawn shoe). */
const SOLE = { heelBack: 0.1, toeFront: 0.35, heel: 0.075, toe: 0.065 } as const

/** Underside of the sole (heel and toe): these touch the ground, not the ankle. */
function solePoints(ankle: Point, toe: Point): Point[] {
  const dx = toe.x - ankle.x
  const dy = toe.y - ankle.y
  const length = Math.hypot(dx, dy) || 1e-6
  const dir = { x: dx / length, y: dy / length }
  const down = { x: -dir.y, y: dir.x }
  const at = (along: number, depth: number) => ({
    x: ankle.x + dir.x * along + down.x * depth,
    y: ankle.y + dir.y * along + down.y * depth,
  })
  return [at(-SOLE.heelBack, SOLE.heel), at(SOLE.toeFront, SOLE.toe)]
}

function lowestY(s: Skeleton): number {
  const points = [s.hip, { x: s.head.x, y: s.head.y + SEGMENT.headRadius }]
  for (const side of [s.near, s.far]) {
    points.push(side.elbow, side.wrist, side.knee, side.ankle, side.toe, ...solePoints(side.ankle, side.toe))
  }
  return Math.max(...points.map((p) => p.y))
}

/** Skeleton resting on the ground (or at `groundOffset`), lifted by `air` for flight phases. */
export function solve(pose: Pose): Skeleton {
  const raw = build(pose, { x: pose.hipX ?? 0, y: 0 })
  const shift = -(pose.groundOffset ?? 0) - (pose.air ?? 0) - lowestY(raw)
  return build(pose, { x: pose.hipX ?? 0, y: shift })
}

/** Value of an angle, filling in a missing foot angle with its default value. */
function valueOf(pose: Pose, key: keyof Pose): number {
  const value = pose[key]
  if (value !== undefined) return value
  if (key === 'nearFoot') return defaultFootAngle(pose.nearShin)
  if (key === 'farFoot') return defaultFootAngle(pose.farShin)
  return 0
}

/**
 * Tangent of a monotone cubic interpolation (Fritsch–Butland): zero at extrema and during
 * holds (two identical poses), continuous elsewhere. The movement thus passes through intermediate
 * poses without stopping, but never overshoots the keyframe values.
 */
function tangent(prev: number, next: number, hPrev: number, hNext: number): number {
  if (prev === 0 || next === 0 || Math.sign(prev) !== Math.sign(next)) return 0
  const w1 = 2 * hNext + hPrev
  const w2 = hNext + 2 * hPrev
  return (w1 + w2) / (w1 / prev + w2 / next)
}

/**
 * Pose at instant `phase` ∈ [0, 1[ of a cycle looping over the keyframes (the last one returns to the first).
 * `timing` gives the instant of each keyframe; without it, they are evenly spaced.
 */
export function poseAt(keyframes: Pose[], phase: number, timing?: number[]): Pose {
  const n = keyframes.length
  if (n === 1) return keyframes[0]!
  const p = ((phase % 1) + 1) % 1
  const times = timing && timing.length === n ? timing : keyframes.map((_, i) => i / n)
  let index = n - 1
  for (let i = 0; i < n; i++) if (times[i]! <= p) index = i
  const at = (i: number) => times[((i % n) + n) % n]! + Math.floor(i / n)
  // Durations of the intervals around the current segment (looped cycle).
  const span = (i: number) => Math.max(at(i + 1) - at(i), 1e-6)
  const h = span(index)
  const local = Math.min(Math.max((p < times[index]! ? p + 1 : p) - times[index]!, 0) / h, 1)
  const t2 = local * local
  const t3 = t2 * local
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + local
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2

  const frame = (i: number) => keyframes[((i % n) + n) % n]!
  const keys = new Set<keyof Pose>()
  for (const k of keyframes) for (const key of Object.keys(k) as Array<keyof Pose>) keys.add(key)
  const pose = {} as Pose
  for (const key of keys) {
    const v0 = valueOf(frame(index - 1), key)
    const v1 = valueOf(frame(index), key)
    const v2 = valueOf(frame(index + 1), key)
    const v3 = valueOf(frame(index + 2), key)
    const hPrev = span(index - 1)
    const hNext = span(index + 1)
    const d0 = (v1 - v0) / hPrev
    const d1 = (v2 - v1) / h
    const d2 = (v3 - v2) / hNext
    const m1 = tangent(d0, d1, hPrev, h)
    const m2 = tangent(d1, d2, h, hNext)
    pose[key] = h00 * v1 + h10 * h * m1 + h01 * v2 + h11 * h * m2
  }
  return pose
}

export function effortAt(phase: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * phase)
}

const ANGLE_KEYS = [
  'torso',
  'nearUpperArm',
  'nearForearm',
  'farUpperArm',
  'farForearm',
  'nearThigh',
  'nearShin',
  'farThigh',
  'farShin',
] as const

function poseDistance(a: Pose, b: Pose): number {
  let sum = 0
  for (const key of ANGLE_KEYS) sum += Math.abs(a[key] - b[key])
  // Displacements (pelvis, flight) count as angles: 1 unit ≈ 60°.
  sum += (Math.abs((a.hipX ?? 0) - (b.hipX ?? 0)) + Math.abs((a.air ?? 0) - (b.air ?? 0))) * 60
  return sum
}

/**
 * Effort intensity (0 → 1) derived from the movement itself: distance of the current pose
 * from the starting position, relative to the maximum distance reached in the cycle. Muscles
 * therefore light up on every rep, whatever the tempo or the number of reps per cycle.
 */
export function effortOf(keyframes: Pose[], pose: Pose): number {
  const rest = keyframes[0]
  if (!rest || keyframes.length < 2) return 0.5
  const max = Math.max(...keyframes.map((k) => poseDistance(k, rest)))
  if (max < 1e-6) return 0.5
  return Math.min(poseDistance(pose, rest) / max, 1)
}

export interface ViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

export function frameFor(keyframes: Pose[], props: SceneProp[] = []): ViewBox {
  const xs: number[] = []
  const ys: number[] = [0]
  for (const pose of keyframes) {
    const s = solve(pose)
    const points = [s.hip, s.neck, s.head]
    for (const side of [s.near, s.far]) points.push(...Object.values(side))
    for (const p of points) {
      xs.push(p.x)
      ys.push(p.y)
    }
    ys.push(s.head.y - SEGMENT.headRadius)
  }
  for (const prop of props) {
    xs.push(prop.x - (prop.width ?? 1) / 2, prop.x + (prop.width ?? 1) / 2)
    ys.push(-(prop.height ?? 0.5))
  }
  const margin = 0.45
  const minX = Math.min(...xs) - margin
  const maxX = Math.max(...xs) + margin
  const minY = Math.min(...ys) - margin
  const maxY = 0.35
  const width = Math.max(maxX - minX, 2.6)
  const center = (minX + maxX) / 2
  return { minX: center - width / 2, minY, width, height: maxY - minY }
}
