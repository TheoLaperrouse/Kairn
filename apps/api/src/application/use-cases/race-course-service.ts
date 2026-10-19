import {
  buildProfile,
  courseStats,
  planRace,
  snapToTrack,
  type AidStation,
  type RaceCourse,
  type RaceCourseSettings,
  type RacePlan,
} from '../../domain/race-course/race-course'
import type { RaceGoal } from '../../domain/goal/race-goal'
import { DomainError } from '../../domain/shared/errors'
import { assertDomain } from '../../domain/shared/errors'
import type { Clock, CourseFileParser, GoalRepository, ProfileRepository, RaceCourseRepository } from '../ports'

export interface RaceCourseView {
  course: RaceCourse
  plan: RacePlan
  /** Écart entre le tracé et l'objectif saisi (distance, D+), pour proposer une mise à jour. */
  goalMismatch?: { distanceKm: number; elevationGainM: number }
}

const MAJOR_STATION = /base de vie|bdv|ravitaillement complet|ravito complet|life base/i
const DEFAULT_SETTINGS: Omit<RaceCourseSettings, 'weightKg'> = {
  startTime: '06:00',
  temperatureC: 15,
  sweat: 'MOYEN',
  gut: 'PARTIEL',
}

export class RaceCourseService {
  constructor(
    private readonly courses: RaceCourseRepository,
    private readonly goals: GoalRepository,
    private readonly profiles: ProfileRepository,
    private readonly parser: CourseFileParser,
    private readonly clock: Clock,
  ) {}

  upload(userId: string, content: Buffer): RaceCourseView {
    const file = this.parser.parse(content)
    const points = buildProfile(file.track)
    const stats = courseStats(points)
    const aidStations: AidStation[] = file.waypoints
      .map((w) => ({ name: w.name.trim() || 'Ravitaillement', km: snapToTrack(file.track, w), major: MAJOR_STATION.test(w.name) }))
      .filter((a) => a.km > 0.5 && a.km < stats.totalDistanceKm - 0.5)
      .sort((a, b) => a.km - b.km)

    const previous = this.courses.get(userId)
    const course: RaceCourse = {
      name: file.name || this.goals.get(userId)?.name || 'Parcours',
      uploadedAt: this.clock.now().toISOString(),
      points,
      ...stats,
      aidStations,
      settings: previous?.settings ?? { ...DEFAULT_SETTINGS, weightKg: this.profiles.get(userId)?.weightKg ?? 70 },
    }
    this.courses.save(userId, course)
    return this.view(userId, course)
  }

  get(userId: string): RaceCourseView | undefined {
    const course = this.courses.get(userId)
    return course ? this.view(userId, course) : undefined
  }

  update(userId: string, change: { aidStations?: AidStation[]; settings?: RaceCourseSettings }): RaceCourseView {
    const course = this.requireCourse(userId)
    const aidStations = change.aidStations ?? course.aidStations
    for (const station of aidStations) {
      assertDomain(station.name.trim().length > 0, 'Chaque ravitaillement doit avoir un nom')
      assertDomain(station.km > 0 && station.km < course.totalDistanceKm, `${station.name} : kilomètre hors du parcours`)
    }
    const updated: RaceCourse = {
      ...course,
      aidStations: [...aidStations].sort((a, b) => a.km - b.km),
      settings: change.settings ?? course.settings,
    }
    this.courses.save(userId, updated)
    return this.view(userId, updated)
  }

  /** Aligne l'objectif (distance, D+, altitude max) sur le tracé officiel. */
  applyToGoal(userId: string): RaceGoal {
    const course = this.requireCourse(userId)
    const goal = this.goals.get(userId)
    if (!goal) throw new DomainError('Aucun objectif à mettre à jour')
    const updated: RaceGoal = {
      ...goal,
      distanceKm: course.totalDistanceKm,
      elevationGainM: course.elevationGainM,
      maxAltitudeM: course.maxAltitudeM,
    }
    this.goals.save(userId, updated)
    return updated
  }

  delete(userId: string): void {
    this.courses.delete(userId)
  }

  private requireCourse(userId: string): RaceCourse {
    const course = this.courses.get(userId)
    if (!course) throw new DomainError('Importe d’abord le GPX officiel de ta course')
    return course
  }

  private view(userId: string, course: RaceCourse): RaceCourseView {
    const goal = this.goals.get(userId)
    const profile = this.profiles.get(userId)
    if (!goal || !profile) throw new DomainError('Renseigne ton objectif et ton profil avant d’analyser le parcours')
    const distanceGap = Math.abs(goal.distanceKm - course.totalDistanceKm) / course.totalDistanceKm
    const gainGap = Math.abs(goal.elevationGainM - course.elevationGainM) / Math.max(course.elevationGainM, 1)
    return {
      course,
      plan: planRace(course, goal, profile.level),
      goalMismatch:
        distanceGap > 0.03 || gainGap > 0.05
          ? { distanceKm: course.totalDistanceKm, elevationGainM: course.elevationGainM }
          : undefined,
    }
  }
}
