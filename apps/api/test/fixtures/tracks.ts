import type { Activity, ActivitySample } from '../../src/domain/activity/activity'
import type { PlannedSession } from '../../src/domain/plan/training-plan'

/** Portion de sortie à allure, pente et FC constantes. */
export interface Leg {
  minutes: number
  km?: number
  /** Dénivelé de la portion (négatif en descente). */
  climbM?: number
  hr?: number
}

/** Trace échantillonnée toutes les 10 s, portion par portion. */
export function track(legs: Leg[], startAltitude = 500): ActivitySample[] {
  const samples: ActivitySample[] = [{ t: 0, d: 0, alt: startAltitude, hr: legs[0]?.hr }]
  let t = 0
  let d = 0
  let alt = startAltitude
  for (const leg of legs) {
    const steps = Math.round((leg.minutes * 60) / 10)
    for (let i = 1; i <= steps; i++) {
      t += 10
      d += (leg.km ?? 0) / steps
      alt += (leg.climbM ?? 0) / steps
      samples.push({ t, d: Math.round(d * 1000) / 1000, alt: Math.round(alt * 10) / 10, ...(leg.hr ? { hr: leg.hr } : {}) })
    }
  }
  return samples
}

export function anActivity(samples: ActivitySample[], overrides: Partial<Activity> = {}): Activity {
  const last = samples.at(-1) ?? { t: 0, d: 0 }
  let gain = 0
  for (let i = 1; i < samples.length; i++) gain += Math.max((samples[i]!.alt ?? 0) - (samples[i - 1]!.alt ?? 0), 0)
  const hrs = samples.flatMap((s) => (s.hr ? [s.hr] : []))
  return {
    id: 'act-1',
    userId: 'u1',
    source: 'FIT',
    externalId: `fit:${Math.random()}`,
    sport: 'RUN',
    name: 'Sortie',
    startTime: '2027-03-03T07:00:00.000Z',
    durationSec: last.t,
    distanceKm: last.d,
    elevationGainM: Math.round(gain),
    avgHeartRate: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined,
    profile: [],
    samples,
    ...overrides,
  }
}

export function aSession(overrides: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id: 'sess-1',
    weekIndex: 0,
    date: '2027-03-03',
    type: 'ENDURANCE',
    sport: 'RUN',
    title: 'Footing vallonné',
    objective: 'Endurance fondamentale',
    durationMin: 60,
    zone: 2,
    keySession: false,
    steps: [],
    tips: [],
    status: 'DONE',
    ...overrides,
  }
}
