import { assertDomain } from '../shared/errors'
import type { PlannedSession, WorkoutStep, Zone } from './training-plan'

/**
 * Structured workout, independent of any file format: this is what
 * the FIT adapter encodes to send it to a Garmin watch.
 */
export type StepIntensity = 'WARMUP' | 'ACTIVE' | 'RECOVERY' | 'COOLDOWN'

export interface TimedStep {
  kind: 'STEP'
  name: string
  durationSec: number
  intensity: StepIntensity
  /** Target heart rate zone, resolved by the watch from the athlete's zones. */
  heartRateZone: Zone
  notes?: string
}

export interface RepeatBlock {
  kind: 'REPEAT'
  times: number
  steps: TimedStep[]
}

export interface WorkoutDefinition {
  name: string
  sport: 'RUN' | 'BIKE'
  items: Array<TimedStep | RepeatBlock>
}

const INTENSITY: Record<WorkoutStep['kind'], StepIntensity> = {
  WARMUP: 'WARMUP',
  EFFORT: 'ACTIVE',
  CONTINUOUS: 'ACTIVE',
  RECOVERY: 'RECOVERY',
  COOLDOWN: 'COOLDOWN',
}

/** Watches truncate names: keep it short. */
const NAME_MAX = 30

export function isExportable(session: PlannedSession): boolean {
  return (session.sport === 'RUN' || session.sport === 'BIKE') && session.type !== 'RACE' && session.durationMin > 0
}

export function toWorkoutDefinition(session: PlannedSession): WorkoutDefinition {
  assertDomain(isExportable(session), 'Seules les séances de course et de vélo peuvent être envoyées sur la montre')
  const steps = session.steps.length
    ? session.steps
    : [{ kind: 'CONTINUOUS' as const, label: session.title, durationMin: session.durationMin, zone: session.zone }]

  const items: WorkoutDefinition['items'] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    const next = steps[i + 1]
    // Effort + recovery repeated n times → a repeat block.
    if (step.repeat && step.repeat > 1 && next?.repeat === step.repeat && next.kind === 'RECOVERY') {
      items.push({ kind: 'REPEAT', times: step.repeat, steps: [toTimed(step), toTimed(next)] })
      i++
    } else if (step.repeat && step.repeat > 1) {
      items.push({ kind: 'REPEAT', times: step.repeat, steps: [toTimed(step)] })
    } else {
      items.push(toTimed(step))
    }
  }
  return { name: session.title.slice(0, NAME_MAX), sport: session.sport === 'BIKE' ? 'BIKE' : 'RUN', items }
}

function toTimed(step: WorkoutStep): TimedStep {
  return {
    kind: 'STEP',
    name: step.label.slice(0, NAME_MAX),
    durationSec: Math.max(5, Math.round(step.durationMin * 60)),
    intensity: INTENSITY[step.kind],
    heartRateZone: step.zone,
    notes: step.terrain,
  }
}
