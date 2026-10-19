/** Schémas JSON des corps de requête : Fastify rejette en 400 tout ce qui ne correspond pas. */

const day = { type: 'integer', minimum: 0, maximum: 6 } as const

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
    level: { enum: ['DEBUTANT', 'INTERMEDIAIRE', 'CONFIRME', 'EXPERT'] },
    weightKg: { type: 'number', minimum: 30, maximum: 200 },
    hrMax: { type: 'integer', minimum: 120, maximum: 230 },
    hrRest: { type: 'integer', minimum: 30, maximum: 110 },
    currentWeeklyKm: { type: 'number', minimum: 0, maximum: 300 },
    currentWeeklyElevationM: { type: 'number', minimum: 0, maximum: 20000 },
    availableDays: { type: 'array', items: day, maxItems: 7 },
    longRunDay: day,
    maxWeeklyHours: { type: 'number', minimum: 3, maximum: 30 },
    terrain: { enum: ['MONTAGNE', 'COLLINES', 'PLAT'] },
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
    raceDate: { type: 'string', format: 'date' },
    distanceKm: { type: 'number' },
    elevationGainM: { type: 'number' },
    technicity: { enum: [1, 2, 3, 4, 5] },
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
    temperatureC: { type: 'number', minimum: -30, maximum: 50 },
    weightKg: { type: 'number' },
    sweat: { enum: ['FAIBLE', 'MOYEN', 'FORT'] },
    gut: { enum: ['AUCUN', 'PARTIEL', 'ENTRAINE'] },
  },
} as const

export const checkInSchema = {
  type: 'object',
  required: ['date', 'sleepHours', 'sleepQuality', 'soreness', 'fatigue', 'motivation', 'stress', 'illnessSymptoms'],
  additionalProperties: false,
  properties: {
    date: { type: 'string', format: 'date' },
    sleepHours: { type: 'number' },
    sleepQuality: { enum: [1, 2, 3, 4, 5] },
    soreness: { enum: [1, 2, 3, 4, 5] },
    fatigue: { enum: [1, 2, 3, 4, 5] },
    motivation: { enum: [1, 2, 3, 4, 5] },
    stress: { enum: [1, 2, 3, 4, 5] },
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
    from: { type: 'string', format: 'date' },
    to: { type: 'string', format: 'date' },
    reason: { enum: ['MALADIE', 'BLESSURE', 'INDISPONIBLE'] },
    crossTrainingOk: { type: 'boolean' },
  },
} as const

export const lightenSchema = {
  type: 'object',
  required: ['mode'],
  additionalProperties: false,
  properties: { mode: { enum: ['ALLEGER', 'REPOS'] } },
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
        startTime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
        temperatureC: { type: 'number', minimum: -30, maximum: 50 },
        sweat: { enum: ['FAIBLE', 'MOYEN', 'FORT'] },
        gut: { enum: ['AUCUN', 'PARTIEL', 'ENTRAINE'] },
        weightKg: { type: 'number', minimum: 35, maximum: 150 },
      },
    },
  },
} as const

const time = { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' } as const

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

export const notificationSettingsSchema = {
  type: 'object',
  required: ['timeZone', 'morning', 'weekly', 'analysis'],
  additionalProperties: false,
  properties: {
    timeZone: { type: 'string', maxLength: 64 },
    morning: { type: 'object', required: ['enabled', 'time'], additionalProperties: false, properties: { enabled: { type: 'boolean' }, time } },
    weekly: { type: 'object', required: ['enabled', 'time'], additionalProperties: false, properties: { enabled: { type: 'boolean' }, time } },
    analysis: { type: 'object', required: ['enabled'], additionalProperties: false, properties: { enabled: { type: 'boolean' } } },
  },
} as const
