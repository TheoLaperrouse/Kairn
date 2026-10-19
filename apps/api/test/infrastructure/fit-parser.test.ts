import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FitActivityParser } from '../../src/infrastructure/parsers/fit-parser'

// Fichier d'activité Garmin réel (jeu de test de python-fitparse, licence MIT).
const fixture = readFileSync(new URL('../fixtures/garmin-run.fit', import.meta.url))

describe('FitActivityParser', () => {
  it('extrait les totaux et le profil altimétrique d’un .FIT Garmin', async () => {
    const activity = await new FitActivityParser().parse(fixture, 'garmin-run.fit')
    expect(activity).toMatchObject({
      source: 'FIT',
      sport: 'RUN',
      startTime: '2013-02-06T12:11:14.000Z',
      durationSec: 2625,
      distanceKm: 4.84,
      avgHeartRate: 147,
    })
    expect(activity.elevationGainM).toBeGreaterThan(100)
    expect(activity.profile).toHaveLength(200)
    expect(activity.externalId).toMatch(/^fit:[0-9a-f]{40}$/)
  })

  it('ne prend en charge que les fichiers .fit', () => {
    const parser = new FitActivityParser()
    expect(parser.supports('Morning_Run.FIT')).toBe(true)
    expect(parser.supports('trace.gpx')).toBe(false)
  })
})
