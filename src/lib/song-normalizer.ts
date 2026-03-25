import type {
  DifficultySlot,
  InstrumentDifficulty,
  InstrumentKey,
  LevelKey,
  RawSong,
  SongViewModel,
} from '../types/song'

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

function normalizeText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function createVersionLabel(firstVer: number[] | null): { key: string; label: string } {
  if (!firstVer || firstVer.length === 0) {
    return { key: 'unknown', label: 'Version TBD' }
  }

  const numbers = firstVer.filter((entry) => Number.isFinite(entry))
  const key = numbers.join('-')

  return {
    key: key || 'unknown',
    label: `Debut ${key || 'TBD'}`,
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
  noteCountValues: number[] | null,
): DifficultySlot[] {
  const baseOffset = instrumentIndex * 5

  return LEVEL_ORDER.map(({ key, label }, levelIndex) => {
    const difficultyRaw = difficultyValues?.[baseOffset + levelIndex + 1] ?? null
    const noteCountRaw = noteCountValues?.[baseOffset + levelIndex + 1] ?? null
    const normalizedDifficulty = formatDifficultyValue(difficultyRaw)

    return {
      level: key,
      label,
      difficulty: normalizedDifficulty.value,
      difficultyText: normalizedDifficulty.text,
      noteCount: noteCountRaw && noteCountRaw > 0 ? noteCountRaw : null,
      noteCountText: noteCountRaw && noteCountRaw > 0 ? String(noteCountRaw) : '--',
      available: normalizedDifficulty.value !== null,
    }
  })
}

function createInstrumentDifficulties(rawSong: RawSong): InstrumentDifficulty[] {
  return INSTRUMENT_ORDER.map(({ key, label }, instrumentIndex) => {
    const levels = createDifficultySlots(
      instrumentIndex,
      rawSong.xg_diff_list ?? null,
      rawSong.remy_notecount_list ?? null,
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
  const primary = rawSong.bpm && rawSong.bpm > 0 ? rawSong.bpm : rawSong.remy_bpm ?? null
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

function createSearchText(rawSong: RawSong, title: string, artist: string): string {
  return [
    title,
    artist,
    rawSong.title_name ?? '',
    rawSong.remy_title ?? '',
    rawSong.title_ascii ?? '',
    rawSong.remy_artist ?? '',
    rawSong.artist_title_ascii ?? '',
    String(rawSong.music_id),
  ]
    .join(' ')
    .toLowerCase()
}

function createImageFallback(title: string): string {
  return title.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'GD'
}

export function normalizeSong(rawSong: RawSong, index: number): SongViewModel {
  const displayTitle = normalizeText(rawSong.title_name, normalizeText(rawSong.remy_title, 'Untitled'))
  const displayArtist = normalizeText(
    rawSong.remy_artist,
    normalizeText(rawSong.artist_title_ascii, 'Artist TBD'),
  )
  const version = createVersionLabel(rawSong.first_ver ?? null)
  const musicType = createCodeLabel(rawSong.music_type ?? null, 'Type')
  const genre = createCodeLabel(rawSong.genre ?? null, 'Genre')
  const bpm = createBpmDisplay(rawSong)
  const instruments = createInstrumentDifficulties(rawSong)
  const tags = [
    rawSong.b_long ? 'Long' : null,
    normalizeBoolean(rawSong.is_classic_seq) ? 'Classic' : null,
    normalizeBoolean(rawSong.is_remaster) ? 'Remaster' : null,
    rawSong.xg_b_session ? 'Session' : null,
  ].filter((entry): entry is string => Boolean(entry))

  return {
    index,
    musicId: rawSong.music_id,
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
    lengthLabel: normalizeText(rawSong.remy_length, 'Length TBD'),
    heroImageUrl: rawSong.remy_imageUrl ?? null,
    imageFallback: createImageFallback(displayTitle),
    tags,
    instruments,
    maxDifficulty: instruments.reduce<number | null>((currentMax, instrument) => {
      if (instrument.maxDifficulty === null) {
        return currentMax
      }

      return currentMax === null ? instrument.maxDifficulty : Math.max(currentMax, instrument.maxDifficulty)
    }, null),
    links: { remyUrl: rawSong.remy_url ?? null },
    searchText: createSearchText(rawSong, displayTitle, displayArtist),
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
