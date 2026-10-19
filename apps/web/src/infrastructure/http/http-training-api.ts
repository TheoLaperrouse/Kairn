import { ApiError, type TrainingApi } from '../../application/ports/training-api'
import type {
  Activity,
  AthleteProfile,
  Dashboard,
  Device,
  Exercise,
  FuelingInput,
  FuelingPlan,
  ImportOutcome,
  PlannedSession,
  ProviderStatus,
  RaceGoal,
  RacePreset,
  Recipe,
  RoutineDetail,
  SessionStatus,
  StrengthRoutine,
  TrainingPlan,
  User,
  AidStation,
  CheckIn,
  CheckInResult,
  LightenMode,
  PlanAdjustment,
  RaceCourseSettings,
  RaceCourseView,
  Unavailability,
  WellnessOverview,
  WorkoutAnalysis,
  WeeklySummary,
  NotificationSettings,
  NotificationStatus,
  PushSubscriptionPayload,
  VamProgress,
  ActivityVerdict,
} from '../../domain/models'

/** Adaptateur HTTP : la session voyage dans un cookie httpOnly posé par le serveur. */
export class HttpTrainingApi implements TrainingApi {
  constructor(
    private readonly baseUrl = '',
    private readonly onUnauthorized: () => void = () => {},
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const isForm = body instanceof FormData
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
    if (response.status === 401 && !path.startsWith('/api/auth/')) this.onUnauthorized()
    const payload = response.headers.get('content-type')?.includes('json') ? await response.json() : undefined
    if (!response.ok) throw new ApiError(payload?.error ?? `Erreur ${response.status}`, response.status)
    return payload as T
  }

  async register(email: string, password: string, displayName: string) {
    return (await this.request<{ user: User }>('POST', '/api/auth/register', { email, password, displayName })).user
  }
  async login(email: string, password: string) {
    return (await this.request<{ user: User }>('POST', '/api/auth/login', { email, password })).user
  }
  async logout() {
    await this.request('POST', '/api/auth/logout')
  }
  async me() {
    try {
      return (await this.request<{ user: User }>('GET', '/api/auth/me')).user
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return undefined
      throw error
    }
  }
  devices() {
    return this.request<Device[]>('GET', '/api/auth/devices')
  }
  async revokeDevice(id: string) {
    await this.request('DELETE', `/api/auth/devices/${encodeURIComponent(id)}`)
  }

  presets() {
    return this.request<RacePreset[]>('GET', '/api/presets')
  }
  getProfile() {
    return this.request<AthleteProfile | null>('GET', '/api/profile')
  }
  saveProfile(profile: AthleteProfile) {
    return this.request<AthleteProfile>('PUT', '/api/profile', profile)
  }
  getGoal() {
    return this.request<RaceGoal | null>('GET', '/api/goal')
  }
  saveGoal(goal: RaceGoal) {
    return this.request<RaceGoal>('PUT', '/api/goal', goal)
  }
  getPlan() {
    return this.request<TrainingPlan | null>('GET', '/api/plan')
  }
  generatePlan() {
    return this.request<TrainingPlan>('POST', '/api/plan/generate')
  }
  updateSession(id: string, change: { status?: SessionStatus; notes?: string }) {
    return this.request<PlannedSession>('PATCH', `/api/sessions/${encodeURIComponent(id)}`, change)
  }
  dashboard() {
    return this.request<Dashboard | null>('GET', '/api/dashboard')
  }

  activities() {
    return this.request<Activity[]>('GET', '/api/activities')
  }
  activity(id: string) {
    return this.request<Activity>('GET', `/api/activities/${encodeURIComponent(id)}`)
  }
  activityVerdicts() {
    return this.request<Record<string, ActivityVerdict>>('GET', '/api/activities/verdicts')
  }
  activityAnalysis(id: string) {
    return this.request<WorkoutAnalysis>('GET', `/api/activities/${encodeURIComponent(id)}/analysis`)
  }
  vamProgress(weeks?: number) {
    return this.request<VamProgress>('GET', `/api/progress/vam${weeks ? `?weeks=${weeks}` : ''}`)
  }
  weeklySummary(weekStart?: string) {
    return this.request<WeeklySummary | null>('GET', `/api/summaries/weekly${weekStart ? `?week=${encodeURIComponent(weekStart)}` : ''}`)
  }
  async deleteActivity(id: string) {
    await this.request('DELETE', `/api/activities/${encodeURIComponent(id)}`)
  }
  importFiles(files: File[]) {
    const form = new FormData()
    for (const file of files) form.append('files', file, file.name)
    return this.request<ImportOutcome[]>('POST', '/api/activities/import', form)
  }
  integrations() {
    return this.request<ProviderStatus[]>('GET', '/api/integrations')
  }
  async connectUrl(provider: string) {
    return (await this.request<{ url: string }>('GET', `/api/integrations/${provider}/connect`)).url
  }
  syncProvider(provider: string) {
    return this.request<ImportOutcome[]>('POST', `/api/integrations/${provider}/sync`)
  }
  async disconnectProvider(provider: string) {
    await this.request('DELETE', `/api/integrations/${provider}`)
  }

  exercises() {
    return this.request<Exercise[]>('GET', '/api/exercises')
  }
  routines() {
    return this.request<StrengthRoutine[]>('GET', '/api/routines')
  }
  routine(id: string) {
    return this.request<RoutineDetail>('GET', `/api/routines/${encodeURIComponent(id)}`)
  }
  recipes() {
    return this.request<Recipe[]>('GET', '/api/recipes')
  }
  fuelingPlan(input: FuelingInput) {
    return this.request<FuelingPlan>('POST', '/api/nutrition/fueling', input)
  }

  async adaptPlan() {
    return (await this.request<{ adjustment: PlanAdjustment | null }>('POST', '/api/plan/adapt')).adjustment
  }
  declareUnavailability(period: Unavailability) {
    return this.request<TrainingPlan>('POST', '/api/plan/unavailability', period)
  }
  lightenSession(id: string, mode: LightenMode) {
    return this.request<PlannedSession>('POST', `/api/sessions/${encodeURIComponent(id)}/lighten`, { mode })
  }

  wellness() {
    return this.request<WellnessOverview>('GET', '/api/wellness')
  }
  submitCheckIn(checkIn: CheckIn) {
    return this.request<CheckInResult>('POST', '/api/wellness/check-in', checkIn)
  }

  raceCourse() {
    return this.request<RaceCourseView | null>('GET', '/api/race-course')
  }
  uploadRaceCourse(file: File) {
    const form = new FormData()
    form.append('file', file, file.name)
    return this.request<RaceCourseView>('POST', '/api/race-course', form)
  }
  updateRaceCourse(change: { aidStations?: AidStation[]; settings?: RaceCourseSettings }) {
    return this.request<RaceCourseView>('PUT', '/api/race-course', change)
  }
  applyRaceCourseToGoal() {
    return this.request<RaceGoal>('POST', '/api/race-course/apply-to-goal')
  }
  async deleteRaceCourse() {
    await this.request('DELETE', '/api/race-course')
  }

  watchStatus() {
    return this.request<{ configured: boolean }>('GET', '/api/watch')
  }
  workoutFileUrl(sessionId: string) {
    return `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/workout.fit`
  }
  async sendSessionToWatch(sessionId: string) {
    await this.request('POST', `/api/sessions/${encodeURIComponent(sessionId)}/send-to-watch`)
  }
  async sendWeekToWatch(weekIndex: number) {
    return (await this.request<{ sent: string[] }>('POST', `/api/plan/weeks/${weekIndex}/send-to-watch`)).sent
  }

  notificationStatus() {
    return this.request<NotificationStatus>('GET', '/api/notifications')
  }
  subscribePush(subscription: PushSubscriptionPayload, timeZone: string) {
    return this.request<NotificationStatus>('POST', '/api/notifications/subscriptions', { subscription, timeZone })
  }
  unsubscribePush(endpoint: string) {
    return this.request<NotificationStatus>('POST', '/api/notifications/unsubscribe', { endpoint })
  }
  updateNotificationSettings(settings: NotificationSettings) {
    return this.request<NotificationStatus>('PUT', '/api/notifications/settings', settings)
  }
  async testNotification() {
    return (await this.request<{ sent: number }>('POST', '/api/notifications/test')).sent
  }
  async calendarUrl() {
    return (await this.request<{ url: string }>('GET', '/api/calendar')).url
  }
  async regenerateCalendarUrl() {
    return (await this.request<{ url: string }>('POST', '/api/calendar/regenerate')).url
  }
}
