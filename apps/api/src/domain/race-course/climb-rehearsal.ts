import { activityDay, type Activity } from '../activity/activity'
import { detectClimbs, type Climb } from '../analysis/climbs'
import { addDays, type IsoDate } from '../shared/dates'
import { round2 } from '../shared/math'
import type { CourseSegment } from './race-course'

/**
 * Matches each key climb or descent of the race with a climb the runner already knows
 * from their own runs, so they can rehearse it at home: "the 900 m climb at 12 %
 * is your 80 m hill at 11 % × 12".
 */

export interface LocalClimb {
  activityId: string
  activityName: string
  date: IsoDate
  startKm: number
  endKm: number
  /** Absolute elevation change, in metres. */
  elevationM: number
  /** Absolute average grade. */
  gradePct: number
  verticalSpeed: number
}

export interface ClimbRehearsal {
  local: LocalClimb
  /** Number of climbs (or descents) of the local hill to match the race segment. */
  repetitions: number
  /** Local grade minus race grade, in percentage points: negative when the local hill is gentler. */
  gradeGapPct: number
  /** Time for the race segment at the speed held on the local hill, before race fatigue. */
  estimatedDurationH: number
}

/** Short hills count here: in flat regions, 25 m is often the best there is. */
const LOCAL_THRESHOLDS = { minElevationM: 25, minDurationSec: 60 }
const LOOKBACK_DAYS = 365
/** Grade gap within which a local hill is a faithful rehearsal. */
const FAITHFUL_GRADE_GAP_PCT = 3

/** Climbs and descents found in the runs of the past year. */
export function localClimbs(activities: Activity[], today: IsoDate): { climbs: LocalClimb[]; descents: LocalClimb[] } {
  const since = addDays(today, -LOOKBACK_DAYS)
  const climbs: LocalClimb[] = []
  const descents: LocalClimb[] = []
  for (const activity of activities) {
    const date = activityDay(activity)
    if (activity.sport !== 'RUN' || !activity.samples?.length || date < since || date > today) continue
    const profile = detectClimbs(activity.samples, LOCAL_THRESHOLDS)
    const toLocal = (c: Climb): LocalClimb => ({
      activityId: activity.id,
      activityName: activity.name,
      date,
      startKm: c.startKm,
      endKm: c.endKm,
      elevationM: Math.abs(c.elevationM),
      gradePct: Math.abs(c.gradePct),
      verticalSpeed: c.verticalSpeed,
    })
    climbs.push(...profile.climbs.map(toLocal))
    descents.push(...profile.descents.map(toLocal))
  }
  return { climbs, descents }
}

/**
 * Best local equivalent of a race segment: among hills with a similar grade, the biggest
 * (fewest repetitions), then the most recent; failing that, the hill with the closest grade.
 */
export function bestRehearsal(segment: CourseSegment, candidates: LocalClimb[]): ClimbRehearsal | undefined {
  if (segment.kind === 'FLAT' || candidates.length === 0) return undefined
  const drop = segment.kind === 'UPHILL' ? segment.gainM : segment.lossM
  const grade = Math.abs(segment.avgGradePct)
  const gap = (c: LocalClimb) => Math.abs(c.gradePct - grade)
  const faithful = candidates.filter((c) => gap(c) <= FAITHFUL_GRADE_GAP_PCT)
  const [local] = faithful.length
    ? [...faithful].sort((a, b) => b.elevationM - a.elevationM || b.date.localeCompare(a.date))
    : [...candidates].sort((a, b) => gap(a) - gap(b) || b.elevationM - a.elevationM)
  return {
    local: local!,
    repetitions: Math.ceil(drop / local!.elevationM),
    gradeGapPct: Math.round((local!.gradePct - grade) * 10) / 10,
    estimatedDurationH: round2(drop / local!.verticalSpeed),
  }
}

/** Attaches a local rehearsal to each key climb and descent of the race plan. */
export function withRehearsals(segments: CourseSegment[], activities: Activity[], today: IsoDate): CourseSegment[] {
  const { climbs, descents } = localClimbs(activities, today)
  return segments.map((s) => {
    if (!s.key) return s
    const rehearsal = bestRehearsal(s, s.kind === 'UPHILL' ? climbs : descents)
    return rehearsal ? { ...s, rehearsal } : s
  })
}
