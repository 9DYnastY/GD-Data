import type { MdbIndex, MdbInstrumentCode, MdbLevelCode, MdbSongRecord } from '../types/mdb'
import type { InstrumentKey, LevelKey } from '../types/song'
import { getMdbSong, MDB_BASE_URL } from './mdb-index'

const INSTRUMENT_CODE: Record<InstrumentKey, MdbInstrumentCode> = {
  drum: 'd',
  guitar: 'g',
  bass: 'b',
}

const LEVEL_CODE: Record<LevelKey, MdbLevelCode> = {
  basic: 'bsc',
  advanced: 'adv',
  extreme: 'ext',
  master: 'mst',
}

const AUDIO_FILE_NAME: Record<InstrumentKey, string> = {
  drum: 'drum.opus',
  guitar: 'guitar.opus',
  bass: 'bass.opus',
}

const LEVEL_ORDER_DESC: LevelKey[] = ['master', 'extreme', 'advanced', 'basic']

function buildAssetUrl(path: string, revision: string) {
  return `${MDB_BASE_URL}/${path}?v=${encodeURIComponent(revision)}`
}

function musicDirectory(musicId: number) {
  return String(musicId).padStart(4, '0')
}

export function resolveMdbCoverUrl(index: MdbIndex, record: MdbSongRecord | null) {
  if (!record?.cover) {
    return null
  }

  return buildAssetUrl(`${musicDirectory(record.music_id)}/cover.png`, index.revision)
}

export function hasMdbChart(
  record: MdbSongRecord | null,
  instrument: InstrumentKey,
  level: LevelKey,
) {
  const instrumentCode = INSTRUMENT_CODE[instrument]
  return record?.charts[instrumentCode]?.includes(LEVEL_CODE[level]) ?? false
}

export function getHighestMdbChartLevel(
  record: MdbSongRecord | null,
  instrument: InstrumentKey,
) {
  return LEVEL_ORDER_DESC.find((level) => hasMdbChart(record, instrument, level)) ?? null
}

export function hasMdbAudio(record: MdbSongRecord | null, instrument: InstrumentKey) {
  return record?.audio.includes(INSTRUMENT_CODE[instrument]) ?? false
}

export function resolveMdbChartUrl(
  index: MdbIndex,
  musicId: number,
  instrument: InstrumentKey,
  level: LevelKey,
) {
  const record = getMdbSong(index, musicId)

  if (!hasMdbChart(record, instrument, level)) {
    return null
  }

  const fileName = `${INSTRUMENT_CODE[instrument]}_${LEVEL_CODE[level]}.dtx`
  return buildAssetUrl(`${musicDirectory(musicId)}/${fileName}`, index.revision)
}

export function resolveMdbAudioUrl(
  index: MdbIndex,
  musicId: number,
  instrument: InstrumentKey,
  level: LevelKey,
) {
  const record = getMdbSong(index, musicId)

  if (
    !hasMdbAudio(record, instrument)
    || getHighestMdbChartLevel(record, instrument) !== level
  ) {
    return null
  }

  return buildAssetUrl(
    `${musicDirectory(musicId)}/${AUDIO_FILE_NAME[instrument]}`,
    index.revision,
  )
}
