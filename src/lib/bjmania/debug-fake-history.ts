import { ref } from 'vue'
import type { BjmaniaRecentPlayPayload, BjmaniaScoreFamily } from '../../types/bjmania'
import { getLocalDateRange } from './recent-history-calendar'
import type { StoredBjmaniaRecentPlay } from './recent-history'

/** Prefix guarantees fake rows never collide with real IndexedDB play ids. */
export const DEBUG_FAKE_HISTORY_ID_PREFIX = 'debug-fake:'

const FAKE_COUNT_PER_CLICK = 30
const fakeHistoryRecords = ref<StoredBjmaniaRecentPlay[]>([])

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomPick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)] as T
}

export function isDebugFakeHistoryId(id: string) {
  return id.startsWith(DEBUG_FAKE_HISTORY_ID_PREFIX)
}

export function isDebugFakeHistoryRecord(record: StoredBjmaniaRecentPlay) {
  return isDebugFakeHistoryId(record.id)
}

export function getDebugFakeHistoryRecords() {
  return fakeHistoryRecords.value.slice()
}

export function clearDebugFakeHistory() {
  fakeHistoryRecords.value = []
}

export function mergeWithDebugFakeHistory(
  realRecords: readonly StoredBjmaniaRecentPlay[],
  predicate?: (record: StoredBjmaniaRecentPlay) => boolean,
) {
  const fakes = predicate
    ? fakeHistoryRecords.value.filter(predicate)
    : fakeHistoryRecords.value

  if (fakes.length === 0) {
    return [...realRecords]
  }

  // Real records are never replaced; fake ids cannot appear in IndexedDB.
  return [...realRecords, ...fakes]
    .slice()
    .sort((left, right) => right.timestamp - left.timestamp || left.id.localeCompare(right.id))
}

/** GF first_ver index 29 / DM first_ver index 28 in song-normalizer maps. */
const GALAXY_WAVE_GF_INDEX = 29
const GALAXY_WAVE_DM_INDEX = 28

export function isGalaxyWaveCatalogSong(song: {
  musicId: number
  versionKey?: string
  versionLabel?: string
}) {
  if (!Number.isFinite(song.musicId) || song.musicId <= 0) {
    return false
  }

  if (song.versionLabel === 'GALAXY WAVE') {
    return true
  }

  const [gfRaw, dmRaw] = String(song.versionKey ?? '').split('-')
  const gfIndex = Number(gfRaw)
  const dmIndex = Number(dmRaw)
  return gfIndex === GALAXY_WAVE_GF_INDEX && dmIndex === GALAXY_WAVE_DM_INDEX
}

export function collectGalaxyWaveMusicIds(
  songs: readonly { musicId: number, versionKey?: string, versionLabel?: string }[],
) {
  return [...new Set(
    songs
      .filter((song) => isGalaxyWaveCatalogSong(song))
      .map((song) => song.musicId),
  )]
}

function buildFakePayload(options: {
  musicId: number
  family: BjmaniaScoreFamily
  timestamp: number
  playerSkill: number
}): BjmaniaRecentPlayPayload {
  // Keep random ranges narrow so debug charts stay readable.
  const failed = Math.random() < 0.12
  const excellent = !failed && Math.random() < 0.06
  const fullCombo = !failed && !excellent && Math.random() < 0.14
  const clear = !failed
  const perc = failed ? -1 : randomInt(8500, 9950)
  const skill = failed ? 0 : randomInt(3500, 7500)
  const newSkill = !failed && Math.random() < 0.3 ? randomInt(1, 250) : 0

  let gameSpec: number
  let seq: number

  if (options.family === 'dm') {
    gameSpec = 1
    seq = randomInt(1, 4)
  } else if (Math.random() < 0.55) {
    gameSpec = 0
    seq = randomInt(1, 4)
  } else {
    gameSpec = 0
    seq = randomInt(5, 8)
  }

  return {
    MusicId: options.musicId,
    // Payload typing marks GameSpec as string; parsers accept numeric strings.
    GameSpec: String(gameSpec),
    Seq: seq,
    GitadoraVersion: 10,
    Skill: skill,
    NewSkill: newSkill,
    Perc: perc,
    Clear: clear,
    FullCombo: fullCombo,
    Excellent: excellent,
    Rank: failed ? 0 : randomInt(3, 8),
    Score: failed ? 0 : randomInt(700000, 980000),
    Combo: failed ? randomInt(0, 40) : randomInt(120, 600),
    PlayerSkill: options.playerSkill,
    Name: 'DEBUG',
    Title: 'DEBUG FAKE',
  }
}

/**
 * Append 30 debug-only fake plays for the selected local day.
 * Music pool is limited to GALAXY WAVE catalog songs.
 * Never writes to IndexedDB — storage is in-memory until debug mode is turned off.
 */
export function generateDebugFakeHistoryForDay(options: {
  userId: string
  dateKey: string
  family: BjmaniaScoreFamily
  songs?: readonly { musicId: number, versionKey?: string, versionLabel?: string }[]
  musicIds?: number[]
  count?: number
}) {
  const range = getLocalDateRange(options.dateKey)

  if (!range) {
    return { added: 0, records: getDebugFakeHistoryRecords(), reason: 'invalid-date' as const }
  }

  const userId = options.userId.trim() || 'unknown'
  const count = Math.max(1, Math.trunc(options.count ?? FAKE_COUNT_PER_CLICK))
  const waveMusicIds = options.songs
    ? collectGalaxyWaveMusicIds(options.songs)
    : (options.musicIds ?? []).filter((id) => Number.isFinite(id) && id > 0)

  if (waveMusicIds.length === 0) {
    return { added: 0, records: getDebugFakeHistoryRecords(), reason: 'no-wave-songs' as const }
  }

  let playerSkillCursor = randomInt(520000, 680000)
  const created: StoredBjmaniaRecentPlay[] = []
  const span = Math.max(1, range.endTime - range.startTime - 1)

  for (let index = 0; index < count; index += 1) {
    const musicId = randomPick(waveMusicIds)
    const timestamp = range.startTime + randomInt(0, span)
    playerSkillCursor += randomInt(-80, 260)
    const payload = buildFakePayload({
      musicId,
      family: options.family,
      timestamp,
      playerSkill: Math.max(0, playerSkillCursor),
    })
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${index}`
    const id = `${DEBUG_FAKE_HISTORY_ID_PREFIX}${encodeURIComponent(userId)}:${options.dateKey}:${nonce}`
    const capturedAt = Date.now()

    const parsedGameSpec = Number(payload.GameSpec)
    const parsedSeq = typeof payload.Seq === 'number' ? payload.Seq : null

    created.push({
      id,
      userId,
      capturedAt,
      lastSeenAt: capturedAt,
      format: 'debug-fake',
      content: '',
      timestamp,
      comment: 'debug-fake-history',
      payload,
      musicId,
      gameSpec: Number.isInteger(parsedGameSpec) ? parsedGameSpec : null,
      seq: parsedSeq,
      gameVersion: typeof payload.GitadoraVersion === 'number' ? payload.GitadoraVersion : null,
      family: options.family,
    })
  }

  fakeHistoryRecords.value = [...fakeHistoryRecords.value, ...created]
  return { added: created.length, records: getDebugFakeHistoryRecords(), reason: 'ok' as const }
}
