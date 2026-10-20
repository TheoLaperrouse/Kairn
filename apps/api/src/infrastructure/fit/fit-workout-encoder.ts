import { randomInt } from 'node:crypto'
import type { WorkoutEncoder } from '../../application/ports'
import type { StepIntensity, TimedStep, WorkoutDefinition } from '../../domain/plan/workout-definition'

/**
 * Minimal encoder for FIT "workout" files (FIT profile 2.0), the format Garmin watches
 * read from the `GARMIN/NewFiles` folder or import into Garmin Connect.
 *
 * Layout: 14-byte header, file_id (0), workout (26) and workout_step (27) messages, trailing CRC.
 */

const FIT_EPOCH_S = 631_065_600 // 1989-12-31T00:00:00Z
const PROFILE_VERSION = 2132
const STRING_SIZE = 32

const enum BaseType {
  Enum = 0x00,
  Uint16 = 0x84,
  Uint32 = 0x86,
  String = 0x07,
  Uint32z = 0x8c,
}

const INVALID = { enum: 0xff, uint16: 0xffff, uint32: 0xffffffff } as const

const enum Mesg {
  FileId = 0,
  Workout = 26,
  WorkoutStep = 27,
}

const SPORT = { RUN: 1, BIKE: 2 } as const
const INTENSITY: Record<StepIntensity, number> = { ACTIVE: 0, RECOVERY: 1, WARMUP: 2, COOLDOWN: 3 }
const DURATION_TIME = 0
const DURATION_REPEAT_UNTIL_STEPS_COMPLETE = 6
const TARGET_HEART_RATE = 1

type FieldDef = [fieldNum: number, size: number, baseType: BaseType]
type FieldValue = number | string

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801,
  0x4400,
]

export function fitCrc(bytes: Uint8Array, initial = 0): number {
  let crc = initial
  for (const byte of bytes) {
    let tmp = CRC_TABLE[crc & 0xf]!
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf]!
    tmp = CRC_TABLE[crc & 0xf]!
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf]!
  }
  return crc
}

class FitWriter {
  private readonly chunks: Buffer[] = []

  define(local: number, global: Mesg, fields: FieldDef[]): void {
    const header = Buffer.alloc(6)
    header.writeUInt8(0x40 | local, 0)
    header.writeUInt8(0, 1) // reserved
    header.writeUInt8(0, 2) // little endian
    header.writeUInt16LE(global, 3)
    header.writeUInt8(fields.length, 5)
    const defs = Buffer.from(fields.flatMap(([num, size, type]) => [num, size, type]))
    this.chunks.push(header, defs)
  }

  write(local: number, fields: FieldDef[], values: FieldValue[]): void {
    const size = fields.reduce((sum, [, s]) => sum + s, 0)
    const record = Buffer.alloc(1 + size)
    record.writeUInt8(local, 0)
    let offset = 1
    fields.forEach(([, fieldSize, type], i) => {
      const value = values[i]!
      if (type === BaseType.String) {
        const encoded = Buffer.from(String(value), 'utf8').subarray(0, fieldSize - 1)
        encoded.copy(record, offset) // the rest is already zeroed (terminator)
      } else if (fieldSize === 1) record.writeUInt8(Number(value), offset)
      else if (fieldSize === 2) record.writeUInt16LE(Number(value), offset)
      else record.writeUInt32LE(Number(value), offset)
      offset += fieldSize
    })
    this.chunks.push(record)
  }

  toBuffer(): Buffer {
    const data = Buffer.concat(this.chunks)
    const header = Buffer.alloc(14)
    header.writeUInt8(14, 0)
    header.writeUInt8(0x20, 1)
    header.writeUInt16LE(PROFILE_VERSION, 2)
    header.writeUInt32LE(data.length, 4)
    header.write('.FIT', 8, 'ascii')
    header.writeUInt16LE(fitCrc(header.subarray(0, 12)), 12)
    const body = Buffer.concat([header, data])
    const crc = Buffer.alloc(2)
    crc.writeUInt16LE(fitCrc(body))
    return Buffer.concat([body, crc])
  }
}

const FILE_ID_FIELDS: FieldDef[] = [
  [0, 1, BaseType.Enum], // type
  [1, 2, BaseType.Uint16], // manufacturer
  [2, 2, BaseType.Uint16], // product
  [3, 4, BaseType.Uint32z], // serial_number
  [4, 4, BaseType.Uint32], // time_created
]
const WORKOUT_FIELDS: FieldDef[] = [
  [8, STRING_SIZE, BaseType.String], // wkt_name
  [4, 1, BaseType.Enum], // sport
  [6, 2, BaseType.Uint16], // num_valid_steps
]
const STEP_FIELDS: FieldDef[] = [
  [254, 2, BaseType.Uint16], // message_index
  [0, STRING_SIZE, BaseType.String], // wkt_step_name
  [1, 1, BaseType.Enum], // duration_type
  [2, 4, BaseType.Uint32], // duration_value
  [3, 1, BaseType.Enum], // target_type
  [4, 4, BaseType.Uint32], // target_value
  [5, 4, BaseType.Uint32], // custom_target_value_low
  [6, 4, BaseType.Uint32], // custom_target_value_high
  [7, 1, BaseType.Enum], // intensity
]

export class FitWorkoutEncoder implements WorkoutEncoder {
  readonly extension = 'fit'

  constructor(private readonly now: () => Date = () => new Date()) {}

  encode(workout: WorkoutDefinition): Buffer {
    const steps = flatten(workout)
    const writer = new FitWriter()
    writer.define(0, Mesg.FileId, FILE_ID_FIELDS)
    writer.write(0, FILE_ID_FIELDS, [
      5, // workout
      255, // development
      0,
      randomInt(1, 0x7fffffff),
      Math.floor(this.now().getTime() / 1000) - FIT_EPOCH_S,
    ])
    writer.define(1, Mesg.Workout, WORKOUT_FIELDS)
    writer.write(1, WORKOUT_FIELDS, [workout.name, SPORT[workout.sport], steps.length])
    writer.define(2, Mesg.WorkoutStep, STEP_FIELDS)
    steps.forEach((step, index) => writer.write(2, STEP_FIELDS, [index, ...step]))
    return writer.toBuffer()
  }
}

/** Flattens the session into FIT steps; a repeat points back to its first step. */
function flatten(workout: WorkoutDefinition): FieldValue[][] {
  const rows: FieldValue[][] = []
  const timed = (step: TimedStep): FieldValue[] => [
    step.name,
    DURATION_TIME,
    step.durationSec * 1000,
    TARGET_HEART_RATE,
    step.heartRateZone,
    0,
    0,
    INTENSITY[step.intensity],
  ]
  for (const item of workout.items) {
    if (item.kind === 'STEP') {
      rows.push(timed(item))
      continue
    }
    const first = rows.length
    item.steps.forEach((step) => rows.push(timed(step)))
    rows.push([
      `Répéter ${item.times} fois`,
      DURATION_REPEAT_UNTIL_STEPS_COMPLETE,
      first,
      INVALID.enum,
      item.times,
      INVALID.uint32,
      INVALID.uint32,
      INTENSITY.ACTIVE,
    ])
  }
  return rows
}
