import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../fixtures/test-app'
import { aGoal, aProfile } from '../fixtures/factories'

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari/604.1'
const LAPTOP = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'

let app: FastifyInstance

beforeAll(async () => {
  app = (await buildTestApp(new Date('2027-03-01T08:00:00Z'))).app
})

afterAll(() => app.close())

function cookieOf(response: { headers: Record<string, unknown> }): string {
  return String(response.headers['set-cookie']).split(';')[0]!
}

describe('HTTP API', () => {
  it('rejects protected routes without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/plan' })
    expect(response.statusCode).toBe(401)
  })

  it('shares one account across two devices and allows revoking one of them', async () => {
    const credentials = { email: 'Theo@Example.com', password: 'ultra-trail-2027' }
    const register = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { 'user-agent': LAPTOP }, payload: { ...credentials, displayName: 'Théo' } })
    expect(register.statusCode).toBe(200)
    const laptop = cookieOf(register)

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'user-agent': PHONE }, payload: { ...credentials, email: 'theo@example.com' } })
    expect(login.statusCode).toBe(200)
    const phone = cookieOf(login)

    // Data written from the laptop is visible on the phone.
    await app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie: laptop }, payload: aProfile() })
    await app.inject({ method: 'PUT', url: '/api/goal', headers: { cookie: laptop }, payload: aGoal() })
    const generated = await app.inject({ method: 'POST', url: '/api/plan/generate', headers: { cookie: laptop } })
    expect(generated.statusCode).toBe(200)
    const fromPhone = await app.inject({ method: 'GET', url: '/api/plan', headers: { cookie: phone } })
    expect(fromPhone.json().id).toBe(generated.json().id)

    const devices = (await app.inject({ method: 'GET', url: '/api/auth/devices', headers: { cookie: laptop } })).json()
    expect(devices.map((d: { deviceLabel: string }) => d.deviceLabel).sort()).toEqual(['Firefox · Linux', 'Safari · iOS'])

    const phoneSession = devices.find((d: { current: boolean }) => !d.current)
    await app.inject({ method: 'DELETE', url: `/api/auth/devices/${phoneSession.id}`, headers: { cookie: laptop } })
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: phone } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: laptop } })).statusCode).toBe(200)
  })

  it('explains invalid input in French', async () => {
    const register = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'valid@example.com', password: 'ultra-trail-2027' } })
    const cookie = cookieOf(register)
    const put = (payload: object) => app.inject({ method: 'PUT', url: '/api/profile', headers: { cookie }, payload })

    const badEnum = await put(aProfile({ level: 'ELITE' as never }))
    expect(badEnum.statusCode).toBe(400)
    expect(badEnum.json().error).toBe('« level » : valeur non autorisée')

    const { name: _name, ...missing } = aProfile()
    expect((await put(missing)).json().error).toBe('Champ obligatoire manquant : « name »')
    expect((await put(aProfile({ weightKg: 500 }))).json().error).toMatch(/^« weightKg » : doit valoir au plus \d+$/)
  })

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const unknown = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nobody@example.com', password: 'whatever-123' } })
    const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'theo@example.com', password: 'wrong-password' } })
    expect(unknown.statusCode).toBe(400)
    expect(wrong.json()).toEqual(unknown.json())
  })

  it('imports a GPX track, links it to the planned session and ignores duplicates', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'theo@example.com', password: 'ultra-trail-2027' } })
    const cookie = cookieOf(login)
    const plan = (await app.inject({ method: 'GET', url: '/api/plan', headers: { cookie } })).json()
    const run = plan.sessions.find((s: { sport: string; type: string }) => s.sport === 'RUN' && s.type !== 'RACE')
    const gpx = buildGpx(run.date)

    const upload = (name: string) => {
      const boundary = '----kairn'
      const body = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: application/gpx+xml\r\n\r\n${gpx}\r\n--${boundary}--\r\n`
      return app.inject({ method: 'POST', url: '/api/activities/import', headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body })
    }
    const first = (await upload('sortie.gpx')).json()
    expect(first[0]).toMatchObject({ status: 'IMPORTED', matchedSessionTitle: run.title })
    expect(first[0].activity.elevationGainM).toBe(120)
    expect((await upload('sortie.gpx')).json()[0].status).toBe('DUPLICATE')

    const session = (await app.inject({ method: 'GET', url: `/api/sessions/${run.id}`, headers: { cookie } })).json()
    expect(session.status).toBe('DONE')
  })
})

function buildGpx(date: string): string {
  const points = Array.from({ length: 13 }, (_, i) => {
    const ele = 100 + (i <= 6 ? i * 20 : (12 - i) * 20)
    const time = new Date(Date.parse(`${date}T07:00:00Z`) + i * 300_000).toISOString()
    return `<trkpt lat="${48.0 + i * 0.002}" lon="-3.0"><ele>${ele}</ele><time>${time}</time></trkpt>`
  }).join('')
  return `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Sortie test</name><type>running</type><trkseg>${points}</trkseg></trk></gpx>`
}
