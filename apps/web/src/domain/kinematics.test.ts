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

describe('cinématique', () => {
  it('pose la semelle sur le sol, cheville à l’épaisseur de la semelle au-dessus', () => {
    const s = solve(standing)
    expect(s.near.ankle.y).toBeCloseTo(-0.075)
    expect(s.hip.y).toBeCloseTo(-2.075)
    expect(s.neck.y).toBeCloseTo(-3.375)
  })

  it('soulève tout le corps pendant une phase aérienne', () => {
    expect(solve({ ...standing, air: 0.4 }).near.ankle.y).toBeCloseTo(-0.475)
  })

  it('interpole en boucle entre la dernière et la première pose-clé', () => {
    const squat = { ...standing, nearThigh: 80, farThigh: 80, nearShin: -20, farShin: -20 }
    expect(poseAt([standing, squat], 0).nearThigh).toBe(0)
    expect(poseAt([standing, squat], 0.5).nearThigh).toBeCloseTo(80)
    expect(poseAt([standing, squat], 0.75).nearThigh).toBeCloseTo(40)
    expect(poseAt([standing, squat], 1).nearThigh).toBe(0)
  })

  it('fait pulser l’effort une fois par cycle', () => {
    expect(effortAt(0)).toBeCloseTo(0)
    expect(effortAt(0.5)).toBeCloseTo(1)
  })
})

describe('cheville', () => {
  it('garde le pied à plat en appui et l’aligne quand la jambe est à l’horizontale', () => {
    expect(defaultFootAngle(0)).toBe(90)
    expect(defaultFootAngle(25)).toBe(90)
    expect(defaultFootAngle(-80)).toBeCloseTo(10)
  })

  it('interpole un angle de pied explicite depuis la valeur par défaut', () => {
    const tiptoe = { ...standing, nearFoot: 60 }
    expect(poseAt([standing, tiptoe], 0.25).nearFoot).toBeCloseTo(75)
  })
})

describe('fluidité', () => {
  it('traverse une pose intermédiaire sans s’y arrêter, mais reste immobile pendant un maintien', () => {
    const mid = { ...standing, nearThigh: 40 }
    const low = { ...standing, nearThigh: 80 }
    const frames = [standing, mid, low, low]
    const timing = [0, 0.25, 0.5, 0.75]
    const before = poseAt(frames, 0.24, timing).nearThigh
    const after = poseAt(frames, 0.26, timing).nearThigh
    expect(after - before).toBeGreaterThan(0.5) // vitesse non nulle au passage de la pose intermédiaire
    expect(poseAt(frames, 0.6, timing).nearThigh).toBeCloseTo(80) // maintien
    expect(poseAt(frames, 0.7, timing).nearThigh).toBeCloseTo(80)
  })
})

describe('tempo', () => {
  it('respecte le minutage des poses-clés (descente lente, remontée rapide)', () => {
    const squat = { ...standing, nearThigh: 80 }
    // Descente sur 75 % du cycle, remontée sur 25 %.
    expect(poseAt([standing, squat], 0.375, [0, 0.75]).nearThigh).toBeCloseTo(40)
    expect(poseAt([standing, squat], 0.875, [0, 0.75]).nearThigh).toBeCloseTo(40)
    expect(poseAt([standing, squat], 0.75, [0, 0.75]).nearThigh).toBeCloseTo(80)
  })
})

describe('allumage des muscles', () => {
  it('suit le mouvement : nul au repos, maximal au point le plus éloigné, à chaque répétition', () => {
    const lunge = { ...standing, nearThigh: 80, farThigh: -30 }
    const other = { ...standing, nearThigh: -30, farThigh: 80 }
    const frames = [standing, lunge, standing, other]
    expect(effortOf(frames, standing)).toBe(0)
    expect(effortOf(frames, lunge)).toBeCloseTo(1)
    expect(effortOf(frames, other)).toBeCloseTo(1)
  })
})
