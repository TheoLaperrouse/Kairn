import { ApiError, type TrainingApi } from '../../application/ports/training-api'
import type { PlanAdjustment, User } from '../../domain/models'

const enc = encodeURIComponent

/**
 * HTTP adapter: the session travels in an httpOnly cookie set by the server.
 * `onFreshness` tells, for each read, whether the service worker answered from its offline copy.
 */
export function createHttpTrainingApi(onUnauthorized: () => void = () => {}, onFreshness: (fromCache: boolean) => void = () => {}): TrainingApi {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const isForm = body instanceof FormData
    let response: Response
    try {
      response = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      })
    } catch {
      throw new ApiError('Pas de connexion : réessaie quand tu auras du réseau.', 0)
    }
    if (method === 'GET') onFreshness(response.headers.has('X-Kairn-Offline'))
    if (response.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized()
    const payload = response.headers.get('content-type')?.includes('json') ? await response.json() : undefined
    if (!response.ok) throw new ApiError(payload?.error ?? `Erreur ${response.status}`, response.status)
    return payload as T
  }

  const get = <T>(path: string) => request<T>('GET', path)
  const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body)
  const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body)
  const remove = async (path: string) => {
    await request('DELETE', path)
  }
  const upload = <T>(path: string, field: string, files: File[]) => {
    const form = new FormData()
    for (const file of files) form.append(field, file, file.name)
    return post<T>(path, form)
  }

  return {
    register: async (email, password, displayName) => (await post<{ user: User }>('/api/auth/register', { email, password, displayName })).user,
    login: async (email, password) => (await post<{ user: User }>('/api/auth/login', { email, password })).user,
    logout: async () => {
      await post('/api/auth/logout')
    },
    me: async () => {
      try {
        return (await get<{ user: User }>('/api/auth/me')).user
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return undefined
        throw error
      }
    },
    devices: () => get('/api/auth/devices'),
    revokeDevice: (id) => remove(`/api/auth/devices/${enc(id)}`),

    presets: () => get('/api/presets'),
    getProfile: () => get('/api/profile'),
    saveProfile: (profile) => put('/api/profile', profile),
    getGoal: () => get('/api/goal'),
    saveGoal: (goal) => put('/api/goal', goal),
    getPlan: () => get('/api/plan'),
    generatePlan: () => post('/api/plan/generate'),
    updateSession: (id, change) => request('PATCH', `/api/sessions/${enc(id)}`, change),
    dashboard: () => get('/api/dashboard'),

    activities: () => get('/api/activities'),
    activity: (id) => get(`/api/activities/${enc(id)}`),
    activityVerdicts: () => get('/api/activities/verdicts'),
    activityAnalysis: (id) => get(`/api/activities/${enc(id)}/analysis`),
    vamProgress: (weeks) => get(`/api/progress/vam${weeks ? `?weeks=${weeks}` : ''}`),
    weeklySummary: (weekStart) => get(`/api/summaries/weekly${weekStart ? `?week=${enc(weekStart)}` : ''}`),
    deleteActivity: (id) => remove(`/api/activities/${enc(id)}`),
    importFiles: (files) => upload('/api/activities/import', 'files', files),
    integrations: () => get('/api/integrations'),
    connectUrl: async (provider) => (await get<{ url: string }>(`/api/integrations/${provider}/connect`)).url,
    syncProvider: (provider) => post(`/api/integrations/${provider}/sync`),
    disconnectProvider: (provider) => remove(`/api/integrations/${provider}`),

    exercises: () => get('/api/exercises'),
    routines: () => get('/api/routines'),
    routine: (id) => get(`/api/routines/${enc(id)}`),
    recipes: () => get('/api/recipes'),
    fuelingPlan: (input) => post('/api/nutrition/fueling', input),

    adaptPlan: async () => (await post<{ adjustment: PlanAdjustment | null }>('/api/plan/adapt')).adjustment,
    declareUnavailability: (period) => post('/api/plan/unavailability', period),
    lightenSession: (id, mode) => post(`/api/sessions/${enc(id)}/lighten`, { mode }),

    wellness: () => get('/api/wellness'),
    submitCheckIn: (checkIn) => post('/api/wellness/check-in', checkIn),

    raceCourse: () => get('/api/race-course'),
    uploadRaceCourse: (file) => upload('/api/race-course', 'file', [file]),
    updateRaceCourse: (change) => put('/api/race-course', change),
    applyRaceCourseToGoal: () => post('/api/race-course/apply-to-goal'),
    deleteRaceCourse: () => remove('/api/race-course'),

    watchStatus: () => get('/api/watch'),
    workoutFileUrl: (sessionId) => `/api/sessions/${enc(sessionId)}/workout.fit`,
    sendSessionToWatch: async (sessionId) => {
      await post(`/api/sessions/${enc(sessionId)}/send-to-watch`)
    },
    sendWeekToWatch: async (weekIndex) => (await post<{ sent: string[] }>(`/api/plan/weeks/${weekIndex}/send-to-watch`)).sent,

    notificationStatus: () => get('/api/notifications'),
    subscribePush: (subscription, timeZone) => post('/api/notifications/subscriptions', { subscription, timeZone }),
    unsubscribePush: (endpoint) => post('/api/notifications/unsubscribe', { endpoint }),
    updateNotificationSettings: (settings) => put('/api/notifications/settings', settings),
    testNotification: async () => (await post<{ sent: number }>('/api/notifications/test')).sent,
    calendarUrl: async () => (await get<{ url: string }>('/api/calendar')).url,
    regenerateCalendarUrl: async () => (await post<{ url: string }>('/api/calendar/regenerate')).url,
  }
}
