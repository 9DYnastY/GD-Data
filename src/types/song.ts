export type LevelKey = 'basic' | 'advanced' | 'extreme' | 'master'
export type InstrumentKey = 'guitar' | 'drum' | 'bass'
export type ToggleFilterValue = 'all' | 'yes' | 'no'
export type SortKey = 'default' | 'title' | 'artist' | 'version' | 'bpm' | 'difficulty'

export interface RawSong {
  music_id: number
  title_name: string | null
  remy_title: string | null
  title_ascii: string | null
  order_ascii: number | null
  order_kana: number | null
  category_kana: number | null
  artist_title_ascii: string | null
  artist_order_ascii: number | null
  artist_order_kana: number | null
  artist_category_kana: number | null
  remy_artist: string | null
  remy_url: string | null
  remy_imageUrl: string | null
  bpm: number | null
  bpm2: number | null
  remy_bpm: number | null
  remy_length: string | null
  first_ver: number[] | null
  music_type: number | null
  genre: number | null
  xg_diff_list: number[] | null
  remy_notecount_list: number[] | null
  is_classic_seq: number | boolean | null
  is_remaster: number | boolean | null
  b_long: boolean | null
  xg_b_session: boolean | null
  disable_area?: number[] | null
}

export interface SongCatalogResponse {
  mdb_data: RawSong[]
}

export interface DifficultySlot {
  level: LevelKey
  label: string
  difficulty: number | null
  difficultyText: string
  noteCount: number | null
  noteCountText: string
  available: boolean
}

export interface InstrumentDifficulty {
  key: InstrumentKey
  label: string
  maxDifficulty: number | null
  levels: DifficultySlot[]
}

export interface SongViewModel {
  index: number
  musicId: number
  displayTitle: string
  displayArtist: string
  titleAscii: string
  artistAscii: string
  versionKey: string
  versionLabel: string
  typeKey: string
  typeLabel: string
  genreKey: string
  genreLabel: string
  bpmPrimary: number | null
  bpmSecondary: number | null
  bpmDisplay: string
  lengthLabel: string
  heroImageUrl: string | null
  heroImageCacheKey: string | null
  imageFallback: string
  tags: string[]
  instruments: InstrumentDifficulty[]
  maxDifficulty: number | null
  links: {
    remyUrl: string | null
  }
  metadata: {
    isClassic: boolean
    isDeleted: boolean
    xgDiffList: number[]
  }
  searchText: string
  sortKeys: {
    defaultOrder: number
    titleAsciiOrder: number
    titleKanaOrder: number
    titleKanaCategory: number
    artistAsciiOrder: number
    artistKanaOrder: number
    artistKanaCategory: number
  }
}

export interface SongFilters {
  versionKey: string
  guitarMin: string
  guitarMax: string
  drumMin: string
  drumMax: string
  bassMin: string
  bassMax: string
}
