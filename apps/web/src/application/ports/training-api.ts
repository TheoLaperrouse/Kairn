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
  CheckIn,
  CheckInResult,
  LightenMode,
  PlanAdjustment,
  AidStation,
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

/** Front-end output port: stores only know this interface, never `fetch`. */
export interface TrainingApi {
  register(email: string, password: string, displayName: string): Promise<User>
  login(email: string, password: string): Promise<User>
  logout(): Promise<void>
  me(): Promise<User | undefined>
  devices(): Promise<Device[]>
  revokeDevice(id: string): Promise<void>

  presets(): Promise<RacePreset[]>
  getProfile(): Promise<AthleteProfile | null>
  saveProfile(profile: AthleteProfile): Promise<AthleteProfile>
  getGoal(): Promise<RaceGoal | null>
  saveGoal(goal: RaceGoal): Promise<RaceGoal>
  getPlan(): Promise<TrainingPlan | null>
  generatePlan(): Promise<TrainingPlan>
  updateSession(id: string, change: { status?: SessionStatus; notes?: string }): Promise<PlannedSession>
  dashboard(): Promise<Dashboard | null>

  activities(): Promise<Activity[]>
  activity(id: string): Promise<Activity>
  activityAnalysis(id: string): Promise<WorkoutAnalysis>
  activityVerdicts(): Promise<Record<string, ActivityVerdict>>
  weeklySummary(weekStart?: string): Promise<WeeklySummary | null>
  vamProgress(weeks?: number): Promise<VamProgress>
  deleteActivity(id: string): Promise<void>
  importFiles(files: File[]): Promise<ImportOutcome[]>
  integrations(): Promise<ProviderStatus[]>
  connectUrl(provider: string): Promise<string>
  syncProvider(provider: string): Promise<ImportOutcome[]>
  disconnectProvider(provider: string): Promise<void>

  exercises(): Promise<Exercise[]>
  routines(): Promise<StrengthRoutine[]>
  routine(id: string): Promise<RoutineDetail>
  recipes(): Promise<Recipe[]>
  fuelingPlan(input: FuelingInput): Promise<FuelingPlan>

  adaptPlan(): Promise<PlanAdjustment | null>
  declareUnavailability(period: Unavailability): Promise<TrainingPlan>
  lightenSession(id: string, mode: LightenMode): Promise<PlannedSession>

  wellness(): Promise<WellnessOverview>
  submitCheckIn(checkIn: CheckIn): Promise<CheckInResult>

  raceCourse(): Promise<RaceCourseView | null>
  uploadRaceCourse(file: File): Promise<RaceCourseView>
  updateRaceCourse(change: { aidStations?: AidStation[]; settings?: RaceCourseSettings }): Promise<RaceCourseView>
  applyRaceCourseToGoal(): Promise<RaceGoal>
  deleteRaceCourse(): Promise<void>

  watchStatus(): Promise<{ configured: boolean }>
  /** Download URL of a session's FIT file (direct link, the cookie is enough). */
  workoutFileUrl(sessionId: string): string
  sendSessionToWatch(sessionId: string): Promise<void>
  sendWeekToWatch(weekIndex: number): Promise<string[]>

  notificationStatus(): Promise<NotificationStatus>
  subscribePush(subscription: PushSubscriptionPayload, timeZone: string): Promise<NotificationStatus>
  unsubscribePush(endpoint: string): Promise<NotificationStatus>
  updateNotificationSettings(settings: NotificationSettings): Promise<NotificationStatus>
  testNotification(): Promise<number>
  calendarUrl(): Promise<string>
  regenerateCalendarUrl(): Promise<string>
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
