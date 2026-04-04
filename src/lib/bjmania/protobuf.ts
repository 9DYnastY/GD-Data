export type ProtoWireType = 0 | 1 | 2 | 5

export interface ProtoField {
  fieldNumber: number
  wireType: ProtoWireType
  value: bigint | Uint8Array | number
}

function ensureBufferWindow(bytes: Uint8Array, offset: number, size: number) {
  if (offset + size > bytes.length) {
    throw new Error('Malformed protobuf payload')
  }
}

export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(totalLength)
  let offset = 0

  chunks.forEach((chunk) => {
    output.set(chunk, offset)
    offset += chunk.length
  })

  return output
}

export function encodeVarint(value: number | bigint): Uint8Array {
  let nextValue = typeof value === 'bigint' ? value : BigInt(value >>> 0)
  const bytes: number[] = []

  while (nextValue >= 0x80n) {
    bytes.push(Number((nextValue & 0x7fn) | 0x80n))
    nextValue >>= 7n
  }

  bytes.push(Number(nextValue))
  return Uint8Array.from(bytes)
}

export function encodeInt32Field(fieldNumber: number, value: number): Uint8Array {
  return concatUint8Arrays([encodeVarint((fieldNumber << 3) | 0), encodeVarint(value)])
}

export function encodeProtoMessage(fields: Uint8Array[]): Uint8Array {
  return concatUint8Arrays(fields)
}

export function readVarint(bytes: Uint8Array, startOffset: number) {
  let offset = startOffset
  let shift = 0n
  let value = 0n

  while (offset < bytes.length) {
    const currentByte = BigInt(bytes[offset])
    value |= (currentByte & 0x7fn) << shift
    offset += 1

    if ((currentByte & 0x80n) === 0n) {
      return { value, offset }
    }

    shift += 7n

    if (shift > 70n) {
      throw new Error('Invalid protobuf varint')
    }
  }

  throw new Error('Unexpected end of protobuf payload')
}

export function parseProtoMessage(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = []
  let offset = 0

  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset)
    offset = tag.offset

    const fieldNumber = Number(tag.value >> 3n)
    const wireType = Number(tag.value & 0x07n) as ProtoWireType

    switch (wireType) {
      case 0: {
        const value = readVarint(bytes, offset)
        offset = value.offset
        fields.push({ fieldNumber, wireType, value: value.value })
        break
      }
      case 1: {
        ensureBufferWindow(bytes, offset, 8)
        fields.push({
          fieldNumber,
          wireType,
          value: bytes.slice(offset, offset + 8),
        })
        offset += 8
        break
      }
      case 2: {
        const length = readVarint(bytes, offset)
        offset = length.offset
        const size = Number(length.value)
        ensureBufferWindow(bytes, offset, size)
        fields.push({
          fieldNumber,
          wireType,
          value: bytes.slice(offset, offset + size),
        })
        offset += size
        break
      }
      case 5: {
        ensureBufferWindow(bytes, offset, 4)
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4)
        fields.push({
          fieldNumber,
          wireType,
          value: view.getFloat32(0, true),
        })
        offset += 4
        break
      }
      default:
        throw new Error(`Unsupported protobuf wire type: ${wireType}`)
    }
  }

  return fields
}

export function getFieldList(fields: ProtoField[], fieldNumber: number) {
  return fields.filter((field) => field.fieldNumber === fieldNumber)
}

export function getStringField(fields: ProtoField[], fieldNumber: number, fallback = '') {
  const field = getFieldList(fields, fieldNumber).find((entry) => entry.wireType === 2)

  if (!field || !(field.value instanceof Uint8Array)) {
    return fallback
  }

  return new TextDecoder().decode(field.value)
}

function decodeSignedInt32(value: bigint) {
  const normalized = value & 0xffffffffn
  return normalized >= 0x80000000n ? Number(normalized - 0x100000000n) : Number(normalized)
}

function decodeZigzagSint32(value: bigint) {
  return Number((value >> 1n) ^ -(value & 1n))
}

export function getInt32Field(fields: ProtoField[], fieldNumber: number, fallback = 0) {
  const field = getFieldList(fields, fieldNumber).find((entry) => entry.wireType === 0)

  if (!field || typeof field.value !== 'bigint') {
    return fallback
  }

  return decodeSignedInt32(field.value)
}

export function getInt64StringField(fields: ProtoField[], fieldNumber: number, fallback = '0') {
  const field = getFieldList(fields, fieldNumber).find((entry) => entry.wireType === 0)

  if (!field || typeof field.value !== 'bigint') {
    return fallback
  }

  return field.value.toString()
}

export function getBoolField(fields: ProtoField[], fieldNumber: number, fallback = false) {
  const field = getFieldList(fields, fieldNumber).find((entry) => entry.wireType === 0)

  if (!field || typeof field.value !== 'bigint') {
    return fallback
  }

  return field.value !== 0n
}

export function getFloatField(fields: ProtoField[], fieldNumber: number, fallback = 0) {
  const field = getFieldList(fields, fieldNumber).find((entry) => entry.wireType === 5)

  if (!field || typeof field.value !== 'number') {
    return fallback
  }

  return field.value
}

export function getPackedInt32Field(fields: ProtoField[], fieldNumber: number) {
  const values: number[] = []

  getFieldList(fields, fieldNumber).forEach((field) => {
    if (field.wireType === 0 && typeof field.value === 'bigint') {
      values.push(Number(field.value))
      return
    }

    if (field.wireType === 2 && field.value instanceof Uint8Array) {
      let offset = 0

      while (offset < field.value.length) {
        const item = readVarint(field.value, offset)
        values.push(Number(item.value))
        offset = item.offset
      }
    }
  })

  return values
}

export function getPackedSint32Field(fields: ProtoField[], fieldNumber: number) {
  const values: number[] = []

  getFieldList(fields, fieldNumber).forEach((field) => {
    if (field.wireType === 0 && typeof field.value === 'bigint') {
      values.push(decodeZigzagSint32(field.value))
      return
    }

    if (field.wireType === 2 && field.value instanceof Uint8Array) {
      let offset = 0

      while (offset < field.value.length) {
        const item = readVarint(field.value, offset)
        values.push(decodeZigzagSint32(item.value))
        offset = item.offset
      }
    }
  })

  return values
}

export function getMessageFieldList(fields: ProtoField[], fieldNumber: number) {
  return getFieldList(fields, fieldNumber)
    .filter((field) => field.wireType === 2 && field.value instanceof Uint8Array)
    .map((field) => parseProtoMessage(field.value as Uint8Array))
}
