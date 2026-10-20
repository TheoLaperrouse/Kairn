/** Schémas JSON des corps de requête : Fastify rejette en 400 tout ce qui ne correspond pas. */

const day = { type: 'integer', minimum: 0, maximum: 6 } as const
const scale = { enum: [1, 2, 3, 4, 5] } as const
const date = { type: 'string', format: 'date' } as const
const time = { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' } as const
const temperatureC = { type: 'number', minimum: -30, maximum: 50 } as const
const sweat = { enum: ['LOW', 'MEDIUM', 'HIGH'] } as const
const gut = { enum: ['NONE', 'PARTIAL', 'TRAINED'] } as const

export const credentialsSchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', maxLength: 254 },
    password: { type: 'string', maxLength: 200 },
    displayName: { type: 'string', maxLength: 60 },
  },
} as const

export const profileSchema = {
  type: 'object',
  required: [
    'name',
    'level',
    'currentWeeklyKm',
    'currentWeeklyElevationM',
    'availableDays',
    'longRunDay',
    'maxWeeklyHours',
    'terrain',
    'crossTraining',
  ],
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 60 },
    level: { enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] },
    weightKg: { type: 'number', minimum: 30, maximum: 200 },
    hrMax: { type: 'integer', minimum: 120, maximum: 230 },
    hrRest: { type: 'integer', minimum: 30, maximum: 110 },
    currentWeeklyKm: { type: 'number', minimum: 0, maximum: 300 },
    currentWeeklyElevationM: { type: 'number', minimum: 0, maximum: 20000 },
    availableDays: { type: 'array', items: day, maxItems: 7 },
    longRunDay: day,
    maxWeeklyHours: { type: 'number', minimum: 3, maximum: 30 },
    terrain: { enum: ['MOUNTAINS', 'HILLS', 'FLAT'] },
    crossTraining: {
      type: 'object',
      required: ['cycling', 'cyclingSessionsPerWeek', 'strength', 'strengthSessionsPerWeek'],
      additionalProperties: false,
      properties: {
        cycling: { type: 'boolean' },
        cyclingSessionsPerWeek: { enum: [1, 2] },
        strength: { type: 'boolean' },
        strengthSessionsPerWeek: { enum: [1, 2] },
      },
    },
  },
} as const

export const goalSchema = {
  type: 'object',
  required: ['name', 'raceDate', 'distanceKm', 'elevationGainM', 'technicity', 'polesAllowed', 'nightSections'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 64 },
    name: { type: 'string', maxLength: 80 },
    raceDate: date,
    distanceKm: { type: 'number' },
    elevationGainM: { type: 'number' },
    technicity: scale,
    maxAltitudeM: { type: 'number', minimum: 0, maximum: 9000 },
    polesAllowed: { type: 'boolean' },
    nightSections: { type: 'boolean' },
    targetTimeH: { type: 'number', minimum: 0.5, maximum: 200 },
    presetId: { type: 'string', maxLength: 40 },
  },
} as const

export const sessionPatchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { enum: ['PLANNED', 'DONE', 'SKIPPED'] },
    notes: { type: 'string', maxLength: 2000 },
  },
} as const

export const fuelingSchema = {
  type: 'object',
  required: ['durationH', 'temperatureC', 'weightKg', 'sweat', 'gut'],
  additionalProperties: false,
  properties: {
    durationH: { type: 'number' },
    temperatureC,
    weightKg: { type: 'number' },
    sweat,
    gut,
  },
} as const

export const checkInSchema = {
  type: 'object',
  required: ['date', 'sleepHours', 'sleepQuality', 'soreness', 'fatigue', 'motivation', 'stress', 'illnessSymptoms'],
  additionalProperties: false,
  properties: {
    date,
    sleepHours: { type: 'number' },
    sleepQuality: scale,
    soreness: scale,
    fatigue: scale,
    motivation: scale,
    stress: scale,
    restingHr: { type: 'number' },
    hrv: { type: 'number' },
    illnessSymptoms: { type: 'boolean' },
    notes: { type: 'string', maxLength: 1000 },
  },
} as const

export const unavailabilitySchema = {
  type: 'object',
  required: ['from', 'to', 'reason', 'crossTrainingOk'],
  additionalProperties: false,
  properties: {
    from: date,
    to: date,
    reason: { enum: ['ILLNESS', 'INJURY', 'UNAVAILABLE'] },
    crossTrainingOk: { type: 'boolean' },
  },
} as const

export const lightenSchema = {
  type: 'object',
  required: ['mode'],
  additionalProperties: false,
  properties: { mode: { enum: ['LIGHTEN', 'REST'] } },
} as const

export const raceCourseUpdateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    aidStations: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        required: ['name', 'km', 'major'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 60 },
          km: { type: 'number' },
          cutoffH: { type: 'number', minimum: 0, maximum: 200 },
          major: { type: 'boolean' },
        },
      },
    },
    settings: {
      type: 'object',
      required: ['startTime', 'temperatureC', 'sweat', 'gut', 'weightKg'],
      additionalProperties: false,
      properties: {
        startTime: time,
        temperatureC,
        sweat,
        gut,
        weightKg: { type: 'number', minimum: 35, maximum: 150 },
      },
    },
  },
} as const

export const pushSubscriptionSchema = {
  type: 'object',
  required: ['subscription'],
  additionalProperties: false,
  properties: {
    subscription: {
      type: 'object',
      required: ['endpoint', 'keys'],
      properties: {
        endpoint: { type: 'string', maxLength: 2048 },
        keys: {
          type: 'object',
          required: ['p256dh', 'auth'],
          properties: { p256dh: { type: 'string', maxLength: 200 }, auth: { type: 'string', maxLength: 100 } },
        },
      },
    },
    timeZone: { type: 'string', maxLength: 64 },
  },
} as const

export const unsubscribeSchema = {
  type: 'object',
  required: ['endpoint'],
  additionalProperties: false,
  properties: { endpoint: { type: 'string', maxLength: 2048 } },
} as const

const timedToggle = {
  type: 'object',
  required: ['enabled', 'time'],
  additionalProperties: false,
  properties: { enabled: { type: 'boolean' }, time },
} as const

export const notificationSettingsSchema = {
  type: 'object',
  required: ['timeZone', 'morning', 'weekly', 'analysis'],
  additionalProperties: false,
  properties: {
    timeZone: { type: 'string', maxLength: 64 },
    morning: timedToggle,
    weekly: timedToggle,
    analysis: { type: 'object', required: ['enabled'], additionalProperties: false, properties: { enabled: { type: 'boolean' } } },
    checkIn: timedToggle,
  },
} as const
