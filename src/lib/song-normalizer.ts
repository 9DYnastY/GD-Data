import type {
  DifficultySlot,
  InstrumentDifficulty,
  InstrumentKey,
  LevelKey,
  RawSong,
  SongViewModel,
} from '../types/song'
import type { MdbIndex, MdbSongRecord } from '../types/mdb'
import { createCoverCacheKey } from './cover-cache'
import { resolveMdbCoverUrl } from './mdb-assets'

const INSTRUMENT_ORDER: Array<{ key: InstrumentKey; label: string }> = [
  { key: 'guitar', label: 'Guitar' },
  { key: 'drum', label: 'Drum' },
  { key: 'bass', label: 'Bass' },
]

const LEVEL_ORDER: Array<{ key: LevelKey; label: string }> = [
  { key: 'basic', label: 'Basic' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'extreme', label: 'Extreme' },
  { key: 'master', label: 'Master' },
]

const GF_VERSION_MAP: Record<number, string> = {
  0: 'GF1st',
  1: 'GF2nd',
  2: 'GF3rd',
  3: 'GF4th',
  4: 'GF5th',
  5: 'GF6th',
  6: 'GF7th',
  7: 'GF8th',
  8: 'GF9th',
  9: 'GF10th',
  10: 'GF11th',
  11: 'V',
  12: 'V2',
  13: 'V3',
  14: 'V4',
  15: 'V5',
  16: 'V6',
  17: 'XG',
  18: 'XG2',
  19: 'XG3',
  20: 'GITADORA',
  21: 'OverDrive',
  22: 'Tri-Boost',
  23: 'Tri-Boost Re:EVOLVE',
  24: 'Matixx',
  25: 'EXCHAIN',
  26: 'NEX+AGE',
  27: 'HIGH-VOLTAGE',
  28: 'FUZZ-UP',
  29: 'GALAXY WAVE',
  30: 'GALAXY WAVE DELTA',
}

const DM_VERSION_MAP: Record<number, string> = {
  0: 'DM1st',
  1: 'DM2nd',
  2: 'DM3rd',
  3: 'DM4th',
  4: 'DM5th',
  5: 'DM6th',
  6: 'DM7th',
  7: 'DM8th',
  8: 'DM9th',
  9: 'DM10th',
  10: 'V',
  11: 'V2',
  12: 'V3',
  13: 'V4',
  14: 'V5',
  15: 'V6',
  16: 'XG',
  17: 'XG2',
  18: 'XG3',
  19: 'GITADORA',
  20: 'OverDrive',
  21: 'Tri-Boost',
  22: 'Tri-Boost Re:EVOLVE',
  23: 'Matixx',
  24: 'EXCHAIN',
  25: 'NEX+AGE',
  26: 'HIGH-VOLTAGE',
  27: 'FUZZ-UP',
  28: 'GALAXY WAVE',
  29: 'GALAXY WAVE DELTA',
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function createVersionLabel(firstVer: number[] | null): { key: string; label: string } {
  if (!firstVer || firstVer.length < 2) {
    return { key: 'unknown', label: 'Version TBD' }
  }

  const numbers = firstVer.filter((entry) => Number.isFinite(entry))
  const key = numbers.join('-')
  const gfVersion = GF_VERSION_MAP[firstVer[0]]
  const dmVersion = DM_VERSION_MAP[firstVer[1]]

  if (!gfVersion || !dmVersion) {
    return {
      key: key || 'unknown',
      label: `Version ${key || 'TBD'}`,
    }
  }

  return {
    key: key || 'unknown',
    label: gfVersion === dmVersion ? gfVersion : `${gfVersion} / ${dmVersion}`,
  }
}

function createCodeLabel(value: number | null, prefix: string): { key: string; label: string } {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { key: 'unknown', label: `${prefix} TBD` }
  }

  return { key: String(value), label: `${prefix} ${value}` }
}

function normalizeBoolean(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1
}

function formatDifficultyValue(rawValue: number | null | undefined): { value: number | null; text: string } {
  if (!rawValue || rawValue <= 0) {
    return { value: null, text: 'No chart' }
  }

  return {
    value: rawValue / 100,
    text: (rawValue / 100).toFixed(2),
  }
}

function createDifficultySlots(
  instrumentIndex: number,
  difficultyValues: number[] | null,
): DifficultySlot[] {
  const baseOffset = instrumentIndex * 5

  return LEVEL_ORDER.map(({ key, label }, levelIndex) => {
    const difficultyRaw = difficultyValues?.[baseOffset + levelIndex + 1] ?? null
    const normalizedDifficulty = formatDifficultyValue(difficultyRaw)

    return {
      level: key,
      label,
      difficulty: normalizedDifficulty.value,
      difficultyText: normalizedDifficulty.text,
      available: normalizedDifficulty.value !== null,
    }
  })
}

function createInstrumentDifficulties(rawSong: RawSong): InstrumentDifficulty[] {
  return INSTRUMENT_ORDER.map(({ key, label }, instrumentIndex) => {
    const levels = createDifficultySlots(
      instrumentIndex,
      rawSong.xg_diff_list ?? null,
    )
    const maxDifficulty = levels.reduce<number | null>((currentMax, level) => {
      if (level.difficulty === null) {
        return currentMax
      }

      return currentMax === null ? level.difficulty : Math.max(currentMax, level.difficulty)
    }, null)

    return { key, label, maxDifficulty, levels }
  })
}

function createBpmDisplay(rawSong: RawSong): { primary: number | null; secondary: number | null; label: string } {
  const primary = rawSong.bpm && rawSong.bpm > 0 ? rawSong.bpm : null
  const secondary =
    rawSong.bpm2 && rawSong.bpm2 > 0 && rawSong.bpm2 !== primary ? rawSong.bpm2 : null

  if (!primary) {
    return { primary: null, secondary: null, label: 'BPM TBD' }
  }

  return {
    primary,
    secondary,
    label: secondary ? `${primary} / ${secondary}` : String(primary),
  }
}

function createSearchText(
  rawSong: RawSong,
  mdbSong: MdbSongRecord | null,
  title: string,
  artist: string,
): string {
  return [
    title,
    artist,
    rawSong.title_name ?? '',
    rawSong.title_ascii ?? '',
    mdbSong?.remy_artist ?? '',
    rawSong.artist_title_ascii ?? '',
    String(rawSong.music_id),
  ]
    .join(' ')
    .toLowerCase()
}

function createImageFallback(title: string): string {
  return title.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'GD'
}

export function normalizeSong(
  rawSong: RawSong,
  index: number,
  mdbIndex: MdbIndex | null,
  mdbSong: MdbSongRecord | null,
): SongViewModel {
  const displayTitle = normalizeText(rawSong.title_name, normalizeText(rawSong.title_ascii, 'Untitled'))
  const displayArtist = normalizeText(
    mdbSong?.remy_artist,
    normalizeText(rawSong.artist_title_ascii, 'Artist TBD'),
  )
  const version = createVersionLabel(rawSong.first_ver ?? null)
  const musicType = createCodeLabel(rawSong.music_type ?? null, 'Type')
  const genre = createCodeLabel(rawSong.genre ?? null, 'Genre')
  const bpm = createBpmDisplay(rawSong)
  const instruments = createInstrumentDifficulties(rawSong)
  const isClassic = normalizeBoolean(rawSong.is_classic_seq)
  const isDeleted =
    rawSong.disable_area?.[0] === 1 &&
    rawSong.disable_area?.[1] === 1 &&
    rawSong.disable_area?.[2] === 1
  const tags = [
    rawSong.b_long ? 'Long' : null,
    isClassic ? 'Classic' : null,
    normalizeBoolean(rawSong.is_remaster) ? 'Remaster' : null,
    rawSong.xg_b_session ? 'Session' : null,
  ].filter((entry): entry is string => Boolean(entry))
  const coverUrl = mdbIndex ? resolveMdbCoverUrl(mdbIndex, mdbSong) : null

  return {
    index,
    musicId: rawSong.music_id,
    rawMdb: { ...rawSong },
    displayTitle,
    displayArtist,
    titleAscii: normalizeText(rawSong.title_ascii, displayTitle),
    artistAscii: normalizeText(rawSong.artist_title_ascii, displayArtist),
    versionKey: version.key,
    versionLabel: version.label,
    typeKey: musicType.key,
    typeLabel: musicType.label,
    genreKey: genre.key,
    genreLabel: genre.label,
    bpmPrimary: bpm.primary,
    bpmSecondary: bpm.secondary,
    bpmDisplay: bpm.label,
    lengthLabel: normalizeText(mdbSong?.remy_length, 'Length TBD'),
    heroImageUrl: coverUrl,
    heroImageCacheKey: createCoverCacheKey(rawSong.music_id, coverUrl),
    imageFallback: createImageFallback(displayTitle),
    tags,
    instruments,
    maxDifficulty: instruments.reduce<number | null>((currentMax, instrument) => {
      if (instrument.maxDifficulty === null) {
        return currentMax
      }

      return currentMax === null ? instrument.maxDifficulty : Math.max(currentMax, instrument.maxDifficulty)
    }, null),
    links: { remyUrl: mdbSong?.remy_url ?? null },
    metadata: {
      isClassic,
      isDeleted,
      xgDiffList: [...(rawSong.xg_diff_list ?? [])],
    },
    searchText: createSearchText(rawSong, mdbSong, displayTitle, displayArtist),
    sortKeys: {
      defaultOrder: index,
      titleAsciiOrder: rawSong.order_ascii ?? index,
      titleKanaOrder: rawSong.order_kana ?? 0,
      titleKanaCategory: rawSong.category_kana ?? 0,
      artistAsciiOrder: rawSong.artist_order_ascii ?? index,
      artistKanaOrder: rawSong.artist_order_kana ?? 0,
      artistKanaCategory: rawSong.artist_category_kana ?? 0,
    },
  }
}
