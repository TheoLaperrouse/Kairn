import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTestApp } from '../fixtures/test-app'

let app: FastifyInstance

beforeAll(async () => {
  const dist = mkdtempSync(join(tmpdir(), 'kairn-dist-'))
  mkdirSync(join(dist, 'assets'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Kairn</title>')
  writeFileSync(join(dist, 'sw.js'), 'const VERSION = "1"')
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')
  ;({ app } = await buildTestApp(new Date('2027-03-03T06:30:00Z'), { webDist: dist }))
})

afterAll(() => app.close())

const get = (url: string) => app.inject({ method: 'GET', url })

describe('web app hosting', () => {
  it('serves the single-page app on any route, always revalidated', async () => {
    const page = await get('/seance/abc')
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('<title>Kairn</title>')
    expect(page.headers['cache-control']).toBe('no-cache')
    expect((await get('/sw.js')).headers['cache-control']).toBe('no-cache')
  })

  it('caches hashed build files for a year', async () => {
    const asset = await get('/assets/app-abc123.js')
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('answers 404 for a missing file instead of the page', async () => {
    const missing = await get('/assets/ActivitiesView-old.js')
    expect(missing.statusCode).toBe(404)
    expect(missing.headers['content-type']).toContain('json')
    expect((await get('/api/unknown')).statusCode).toBe(404)
  })
})
