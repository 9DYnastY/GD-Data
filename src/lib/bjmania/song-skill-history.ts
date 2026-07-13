import type { InstrumentKey, LevelKey, SongViewModel } from '../../types/song'
import { mapRecentPlaysToList, rawSkillToText } from './client'
import type { StoredBjmaniaRecentPlay } from './recent-history'

export const SONG_SKILL_LEVEL_COLORS: Record<LevelKey, string> = {
  master: '#8c49b5',
  extreme: '#ac2a42',
  advanced: '#c17006',
  basic: '#4a86e0',
}

export const SONG_SKILL_LEVEL_LABELS: Record<LevelKey, string> = {
  master: 'MAS',
  extreme: 'EXT',
  advanced: 'ADV',
  basic: 'BAS',
}

export const SONG_SKILL_LEVEL_ORDER: LevelKey[] = ['basic', 'advanced', 'extreme', 'master']

export interface SongSkillHistoryPoint {
  id: string
  timestamp: number
  skillRaw: number
  skillText: string
  level: LevelKey
  instrument: InstrumentKey
  percText: string
  clearLabel: string
  failed: boolean
  playedAtText: string
}

function isFailedPlay(options: {
  clear: boolean
  fullCombo: boolean
  excellent: boolean
}) {
  return !options.clear && !options.fullCombo && !options.excellent
}

export function mapRecordsToSongSkillHistoryPoints(
  records: readonly StoredBjmaniaRecentPlay[],
  songs: SongViewModel[],
  options: {
    musicId: number
    instrument: InstrumentKey
  },
): SongSkillHistoryPoint[] {
  const mappedRows = mapRecentPlaysToList([...records], songs)

  return records
    .map((record, index) => {
      const row = mappedRows[index]

      if (!row || row.musicId !== options.musicId || row.instrument !== options.instrument || !row.level) {
        return null
      }

      if (!Number.isFinite(row.timestamp) || row.timestamp <= 0) {
        return null
      }

      const failed = isFailedPlay({
        clear: row.clear,
        fullCombo: row.fullCombo,
        excellent: row.excellent,
      })

      let skillRaw: number

      if (failed) {
        skillRaw = 0
      } else if (row.skillRaw !== null && Number.isFinite(row.skillRaw)) {
        skillRaw = row.skillRaw
      } else {
        return null
      }

      return {
        id: record.id,
        timestamp: row.timestamp,
        skillRaw,
        skillText: rawSkillToText(skillRaw),
        level: row.level,
        instrument: row.instrument,
        percText: row.percText,
        clearLabel: row.clearLabel,
        failed,
        playedAtText: row.playedAtText,
      } satisfies SongSkillHistoryPoint
    })
    .filter((point): point is SongSkillHistoryPoint => point !== null)
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
}

export function groupSongSkillHistoryByLevel(points: readonly SongSkillHistoryPoint[]) {
  const groups = new Map<LevelKey, SongSkillHistoryPoint[]>()

  SONG_SKILL_LEVEL_ORDER.forEach((level) => {
    groups.set(level, [])
  })

  points.forEach((point) => {
    const bucket = groups.get(point.level)

    if (bucket) {
      bucket.push(point)
    }
  })

  return SONG_SKILL_LEVEL_ORDER
    .map((level) => ({
      level,
      label: SONG_SKILL_LEVEL_LABELS[level],
      color: SONG_SKILL_LEVEL_COLORS[level],
      points: groups.get(level) ?? [],
    }))
    .filter((series) => series.points.length > 0)
}
