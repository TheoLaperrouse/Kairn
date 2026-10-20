import type { ProfilePoint } from '../../domain/models'

/** "Round" step (1, 2 or 5 × 10ⁿ) splitting `range` into about `target` intervals. */
export function niceStep(range: number, target: number): number {
  const raw = range / Math.max(target, 1)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  return (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude
}

/** Ticks from `from` to `to` inclusive, rounded to smooth out floating-point errors. */
export function ticksBetween(from: number, to: number, step: number, digits = 2): number[] {
  const factor = 10 ** digits
  const list: number[] = []
  for (let v = from; v <= to + step / 1000; v += step) list.push(Math.round(v * factor) / factor)
  return list
}

/** Pointer x coordinate in the chart's coordinate system (the SVG may be scaled). */
export function pointerX(event: PointerEvent, width: number): number {
  const rect = (event.currentTarget as Element).getBoundingClientRect()
  return ((event.clientX - rect.left) / rect.width) * width
}

export function linePath(points: Array<readonly [number, number]>): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

export type ProfileScale = ReturnType<typeof profileScale>

/** Scales of an elevation profile: altitude on the y axis, distance on the x axis. */
export function profileScale(
  points: ProfilePoint[],
  box: { width: number; height: number; pad: { top: number; right: number; bottom: number; left: number } },
  options: { minAltitudeRange: number; pxPerXTick: number },
) {
  const { width, height, pad } = box
  const maxD = Math.max(points.at(-1)?.distanceKm ?? 1, 0.1)
  const alts = points.map((p) => p.altitudeM)
  const rawMin = Math.min(...alts)
  const rawMax = Math.max(...alts)
  const stepY = niceStep(Math.max(rawMax - rawMin, options.minAltitudeRange), 4)
  const minA = Math.floor(rawMin / stepY) * stepY
  const maxA = Math.ceil(rawMax / stepY) * stepY || minA + stepY
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const stepX = niceStep(maxD, Math.max(Math.floor(innerW / options.pxPerXTick), 2))
  return {
    maxD,
    innerW,
    innerH,
    base: pad.top + innerH,
    x: (d: number) => pad.left + (d / maxD) * innerW,
    y: (a: number) => pad.top + innerH - ((a - minA) / (maxA - minA)) * innerH,
    yTicks: ticksBetween(minA, maxA, stepY),
    xTicks: ticksBetween(0, maxD, stepX, 1),
  }
}

/** Profile line and area under the curve. */
export function profilePaths(points: ProfilePoint[], scale: ProfileScale): { line: string; area: string } {
  const line = linePath(points.map((p) => [scale.x(p.distanceKm), scale.y(p.altitudeM)]))
  if (points.length < 2) return { line, area: '' }
  return { line, area: `${line} L${scale.x(points.at(-1)!.distanceKm).toFixed(1)},${scale.base} L${scale.x(0)},${scale.base} Z` }
}
