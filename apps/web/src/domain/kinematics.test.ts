import { describe, expect, it } from 'vitest'
import { defaultFootAngle, effortAt, effortOf, poseAt, solve } from './kinematics'
import type { Pose } from './models'

const standing: Pose = {
  torso: 0,
  nearUpperArm: 0,
  nearForearm: 0,
  farUpperArm: 0,
  farForearm: 0,
  nearThigh: 0,
  nearShin: 0,
  farThigh: 0,
  farShin: 0,
}

describe('kinematics', () => {
  it('puts the sole on the ground, with the ankle one sole thickness above', () => {
    const s = solve(standing)
    expect(s.near.ankle.y).toBeCloseTo(-0.075)
    expect(s.hip.y).toBeCloseTo(-2.075)
    expect(s.neck.y).toBeCloseTo(-3.375)
  })

  it('lifts the whole body during a flight phase', () => {
    expect(solve({ ...standing, air: 0.4 }).near.ankle.y).toBeCloseTo(-0.475)
  })

  it('loops the interpolation from the last keyframe back to the first', () => {
    const squat = { ...standing, nearThigh: 80, farThigh: 80, nearShin: -20, farShin: -20 }
    expect(poseAt([standing, squat], 0).nearThigh).toBe(0)
    expect(poseAt([standing, squat], 0.5).nearThigh).toBeCloseTo(80)
    expect(poseAt([standing, squat], 0.75).nearThigh).toBeCloseTo(40)
    expect(poseAt([standing, squat], 1).nearThigh).toBe(0)
  })

  it('pulses the effort once per cycle', () => {
    expect(effortAt(0)).toBeCloseTo(0)
    expect(effortAt(0.5)).toBeCloseTo(1)
  })
})

describe('ankle', () => {
  it('keeps the foot flat when standing and aligns it when the leg is horizontal', () => {
    expect(defaultFootAngle(0)).toBe(90)
    expect(defaultFootAngle(25)).toBe(90)
    expect(defaultFootAngle(-80)).toBeCloseTo(10)
  })

  it('interpolates an explicit foot angle from the default value', () => {
    const tiptoe = { ...standing, nearFoot: 60 }
    expect(poseAt([standing, tiptoe], 0.25).nearFoot).toBeCloseTo(75)
  })
})

describe('smoothness', () => {
  it('passes through an intermediate pose without stopping, but stays still during a hold', () => {
    const mid = { ...standing, nearThigh: 40 }
    const low = { ...standing, nearThigh: 80 }
    const frames = [standing, mid, low, low]
    const timing = [0, 0.25, 0.5, 0.75]
    const before = poseAt(frames, 0.24, timing).nearThigh
    const after = poseAt(frames, 0.26, timing).nearThigh
    expect(after - before).toBeGreaterThan(0.5) // non-zero speed through the intermediate pose
    expect(poseAt(frames, 0.6, timing).nearThigh).toBeCloseTo(80) // hold
    expect(poseAt(frames, 0.7, timing).nearThigh).toBeCloseTo(80)
  })
})

describe('tempo', () => {
  it('follows keyframe timing (slow descent, fast ascent)', () => {
    const squat = { ...standing, nearThigh: 80 }
    // Descent over 75 % of the cycle, ascent over 25 %.
    expect(poseAt([standing, squat], 0.375, [0, 0.75]).nearThigh).toBeCloseTo(40)
    expect(poseAt([standing, squat], 0.875, [0, 0.75]).nearThigh).toBeCloseTo(40)
    expect(poseAt([standing, squat], 0.75, [0, 0.75]).nearThigh).toBeCloseTo(80)
  })
})

describe('muscle highlighting', () => {
  it('follows the movement: zero at rest, maximal at the furthest point, on every rep', () => {
    const lunge = { ...standing, nearThigh: 80, farThigh: -30 }
    const other = { ...standing, nearThigh: -30, farThigh: 80 }
    const frames = [standing, lunge, standing, other]
    expect(effortOf(frames, standing)).toBe(0)
    expect(effortOf(frames, lunge)).toBeCloseTo(1)
    expect(effortOf(frames, other)).toBeCloseTo(1)
  })
})
