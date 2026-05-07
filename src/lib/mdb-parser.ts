import type { RawSong, SongCatalogResponse } from '../types/song'
import {
  getBoolField,
  getFieldList,
  getMessageFieldList,
  getPackedInt32Field,
  parseProtoMessage,
} from './bjmania/protobuf'

function decodeZigzagSint32(value: bigint) {
  return Number((value >> 1n) ^ -(value & 1n))
}

function getOptionalVarintField(fields: ReturnType<typeof parseProtoMessage>, fieldNumber: number) {
  const field = getFieldList(fields, fieldNumber).find((entry) => (
    entry.wireType === 0 && typeof entry.value === 'bigint'
  ))

  return field && typeof field.value === 'bigint' ? field.value : null
}

function getOptionalUint32Field(fields: ReturnType<typeof parseProtoMessage>, fieldNumber: number) {
  const value = getOptionalVarintField(fields, fieldNumber)
  return value === null ? null : Number(value)
}

function getOptionalSint32Field(fields: ReturnType<typeof parseProtoMessage>, fieldNumber: number) {
  const value = getOptionalVarintField(fields, fieldNumber)
  return value === null ? null : decodeZigzagSint32(value)
}

function getOptionalBoolField(fields: ReturnType<typeof parseProtoMessage>, fieldNumber: number) {
  return getOptionalVarintField(fields, fieldNumber) === null ? null : getBoolField(fields, fieldNumber)
}

function getOptionalStringField(fields: ReturnType<typeof parseProtoMessage>, fieldNumber: number) {
  const field = getFieldList(fields, fieldNumber).find((entry) => (
    entry.wireType === 2 && entry.value instanceof Uint8Array
  ))

  return field && field.value instanceof Uint8Array ? new TextDecoder().decode(field.value) : null
}

function getOptionalPackedUint32Field(fields: ReturnType<typeof parseProtoMessage>, fieldNumber: number) {
  const values = getPackedInt32Field(fields, fieldNumber)
  return values.length > 0 ? values : null
}

function parseMusicData(fields: ReturnType<typeof parseProtoMessage>, index: number): RawSong {
  const musicId = getOptionalSint32Field(fields, 1)
  const seqId = getOptionalSint32Field(fields, 44)

  return {
    music_id: musicId ?? seqId ?? index,
    title_name: getOptionalStringField(fields, 38),
    remy_title: null,
    title_ascii: getOptionalStringField(fields, 14),
    order_ascii: getOptionalUint32Field(fields, 15),
    order_kana: getOptionalUint32Field(fields, 16),
    category_kana: getOptionalSint32Field(fields, 17),
    artist_title_ascii: getOptionalStringField(fields, 18),
    artist_order_ascii: getOptionalUint32Field(fields, 19),
    artist_order_kana: getOptionalUint32Field(fields, 20),
    artist_category_kana: getOptionalSint32Field(fields, 21),
    remy_artist: null,
    remy_url: null,
    remy_imageUrl: null,
    bpm: getOptionalUint32Field(fields, 12),
    bpm2: getOptionalUint32Field(fields, 13),
    remy_bpm: null,
    remy_length: null,
    first_ver: getOptionalPackedUint32Field(fields, 8),
    music_type: getOptionalUint32Field(fields, 32),
    genre: getOptionalUint32Field(fields, 33),
    xg_diff_list: getOptionalPackedUint32Field(fields, 3),
    is_classic_seq: getOptionalUint32Field(fields, 45),
    is_remaster: getOptionalUint32Field(fields, 37),
    b_long: getOptionalBoolField(fields, 10),
    xg_b_session: getOptionalBoolField(fields, 25),
    disable_area: getOptionalPackedUint32Field(fields, 41),
  }
}

export function parseMdbBinary(payload: Uint8Array): SongCatalogResponse {
  const fields = parseProtoMessage(payload)

  return {
    mdb_data: getMessageFieldList(fields, 1).map((songFields, index) => parseMusicData(songFields, index)),
  }
}
