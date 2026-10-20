import type { AthleteProfile } from '../../src/domain/athlete/athlete-profile'
import type { RaceGoal } from '../../src/domain/goal/race-goal'
import { ROUTINES } from '../../src/infrastructure/catalog/routines'

export function aProfile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    name: 'Théo',
    level: 'INTERMEDIATE',
    weightKg: 70,
    hrMax: 190,
    hrRest: 50,
    currentWeeklyKm: 35,
    currentWeeklyElevationM: 800,
    availableDays: [1, 2, 3, 5, 6],
    longRunDay: 5,
    maxWeeklyHours: 12,
    terrain: 'HILLS',
    crossTraining: { cycling: true, cyclingSessionsPerWeek: 1, strength: true, strengthSessionsPerWeek: 2 },
    ...overrides,
  }
}

export function aGoal(overrides: Partial<RaceGoal> = {}): RaceGoal {
  return {
    id: 'goal-1',
    name: 'CCC',
    raceDate: '2027-08-27',
    distanceKm: 101,
    elevationGainM: 6100,
    technicity: 3,
    maxAltitudeM: 2584,
    polesAllowed: true,
    nightSections: true,
    ...overrides,
  }
}

export const routineSummaries = ROUTINES.map(({ id, name, phases, durationMin }) => ({ id, name, phases, durationMin }))
