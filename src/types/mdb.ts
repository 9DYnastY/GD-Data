export type MdbInstrumentCode = 'd' | 'g' | 'b'
export type MdbLevelCode = 'nov' | 'bsc' | 'adv' | 'ext' | 'mst'

export interface MdbSongRecord {
  music_id: number
  remy_artist?: string
  remy_url?: string
  remy_length?: string
  cover: boolean
  audio: MdbInstrumentCode[]
  charts: Partial<Record<MdbInstrumentCode, MdbLevelCode[]>>
}

export interface MdbIndex {
  schema: 1
  revision: string
  count: number
  songs: Record<string, MdbSongRecord>
}
