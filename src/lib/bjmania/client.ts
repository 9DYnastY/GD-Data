import type {
  BjmaniaAuthUser,
  BjmaniaBestScoreItem,
  BjmaniaBestScoresResponse,
  BjmaniaGameProfile,
  BjmaniaGitadoraProfile,
  BjmaniaGitadoraSnapshot,
  BjmaniaLoginPayload,
  BjmaniaProfileSticker,
  BjmaniaProfilesResponse,
  BjmaniaRecentPlay,
  BjmaniaRecentPlayEntry,
  BjmaniaRecentPlayPayload,
  BjmaniaRecentPlaysResponse,
  BjmaniaScoreListItem,
  BjmaniaScoreSheet,
  BjmaniaRecentListItem,
} from '../../types/bjmania'
import type { InstrumentKey, LevelKey, SongViewModel } from '../../types/song'
import { decodeGrpcWebUnary, encodeGrpcWebUnary } from './grpc-web'
import { bjmaniaGrpcRequest, bjmaniaJsonRequest } from './http'
import {
  encodeInt32Field,
  encodeProtoMessage,
  getBoolField,
  getFloatField,
  getInt32Field,
  getInt64StringField,
  getMessageFieldList,
  getPackedInt32Field,
  getStringField,
  parseProtoMessage,
} from './protobuf'

const GITADORA_GAME_CODE = 'M32'
const RANK_LABELS: Record<number, string> = {
  0: '---',
  1: 'E',
  2: 'D',
  3: 'C',
  4: 'B',
  5: 'A',
  6: 'AA',
  7: 'AAA',
  8: 'S',
}
const LEVEL_BY_INDEX: Record<number, LevelKey> = {
  1: 'basic',
  2: 'advanced',
  3: 'extreme',
  4: 'master',
}
const LEVEL_LABELS: Record<LevelKey, string> = {
  basic: 'BASIC',
  advanced: 'ADVANCED',
  extreme: 'EXTREME',
  master: 'MASTER',
}

function parseAuthUser(payload: unknown): BjmaniaAuthUser {
  const data = (payload ?? {}) as Partial<BjmaniaAuthUser>

  return {
    id: String(data.id ?? ''),
    name: String(data.name ?? ''),
    email: String(data.email ?? ''),
    ip: data.ip,
    rk: data.rk,
    social: data.social,
    avatar: data.avatar,
  }
}

function parseGameProfile(fields: ReturnType<typeof parseProtoMessage>): BjmaniaGameProfile {
  return {
    gameCode: getStringField(fields, 1),
    gameVersions: getPackedInt32Field(fields, 2),
  }
}

function parseProfilesResponse(payload: Uint8Array): BjmaniaProfilesResponse {
  const fields = parseProtoMessage(payload)

  return {
    profiles: getMessageFieldList(fields, 1).map(parseGameProfile),
    status: getInt32Field(fields, 2),
  }
}

function parseSticker(fields: ReturnType<typeof parseProtoMessage>): BjmaniaProfileSticker {
  return {
    stickerId: getInt32Field(fields, 1),
    posX: getFloatField(fields, 2),
    posY: getFloatField(fields, 3),
    scaleX: getFloatField(fields, 4),
    scaleY: getFloatField(fields, 5),
    rotate: getFloatField(fields, 6),
  }
}

function parseGitadoraProfileResponse(payload: Uint8Array, version: number): BjmaniaGitadoraProfile {
  const fields = parseProtoMessage(payload)

  return {
    name: getStringField(fields, 1),
    title: getStringField(fields, 2),
    stickers: getMessageFieldList(fields, 3).map(parseSticker),
    status: getInt32Field(fields, 4),
    version,
    gfSkillRaw: getInt32Field(fields, 11),
    gfAllSkillRaw: getInt32Field(fields, 12),
    gfRank: getInt32Field(fields, 13),
    gfAllUser: getInt32Field(fields, 14),
    dmSkillRaw: getInt32Field(fields, 21),
    dmAllSkillRaw: getInt32Field(fields, 22),
    dmRank: getInt32Field(fields, 23),
    dmAllUser: getInt32Field(fields, 24),
  }
}

function parseBestScoreItem(fields: ReturnType<typeof parseProtoMessage>): BjmaniaBestScoreItem {
  return {
    musicId: getInt32Field(fields, 1),
    fumen: getInt32Field(fields, 2),
    percRaw: getInt32Field(fields, 10),
    rank: getInt32Field(fields, 11),
    autoClear: getBoolField(fields, 12),
    clear: getBoolField(fields, 13),
    fullCombo: getBoolField(fields, 14),
    excellent: getBoolField(fields, 15),
    meter: getInt64StringField(fields, 16),
    meterProg: getInt32Field(fields, 17),
  }
}

function parseBestScoresResponse(payload: Uint8Array): BjmaniaBestScoresResponse {
  const fields = parseProtoMessage(payload)

  return {
    bestScores: getMessageFieldList(fields, 1).map(parseBestScoreItem),
    status: getInt32Field(fields, 2),
  }
}

function parseRecentPlayEntry(fields: ReturnType<typeof parseProtoMessage>): BjmaniaRecentPlayEntry {
  return {
    format: getStringField(fields, 1),
    content: getStringField(fields, 2),
    timestamp: getInt32Field(fields, 3),
    comment: getStringField(fields, 4),
  }
}

function parseRecentContent(content: string) {
  if (!content) {
    return null
  }

  try {
    return JSON.parse(content) as BjmaniaRecentPlayPayload
  } catch {
    return null
  }
}

function parseRecentPlaysResponse(payload: Uint8Array): BjmaniaRecentPlaysResponse {
  const fields = parseProtoMessage(payload)

  return {
    recentPlayEntries: getMessageFieldList(fields, 1).map((entryFields): BjmaniaRecentPlay => {
      const entry = parseRecentPlayEntry(entryFields)

      return {
        ...entry,
        payload: parseRecentContent(entry.content),
      }
    }),
  }
}

async function callGrpcUnary(path: string, message: Uint8Array) {
  const response = await bjmaniaGrpcRequest(path, encodeGrpcWebUnary(message))

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`gRPC request failed: ${path} (${response.status})`)
  }

  return decodeGrpcWebUnary(response.body)
}

export async function loginBjmania(payload: BjmaniaLoginPayload) {
  const response = await bjmaniaJsonRequest<null>({
    path: '/api/auth/login',
    method: 'POST',
    body: payload,
  })

  if (response.status !== 204) {
    throw new Error(`Login failed with status ${response.status}`)
  }
}

export async function getBjmaniaAuthMe() {
  const response = await bjmaniaJsonRequest<BjmaniaAuthUser>({
    path: '/api/auth/me',
    method: 'GET',
  })

  if (response.status < 200 || response.status >= 300 || !response.data) {
    throw new Error(`Auth check failed with status ${response.status}`)
  }

  return parseAuthUser(response.data)
}

export async function getBjmaniaProfiles() {
  const payload = await callGrpcUnary('/api/WebUI/GetProfiles', new Uint8Array())
  return parseProfilesResponse(payload)
}

export async function getBjmaniaGitadoraProfile(version: number) {
  const request = encodeProtoMessage([encodeInt32Field(2, version)])
  const payload = await callGrpcUnary('/api/WebUI/GetGitadoraProfile', request)
  return parseGitadoraProfileResponse(payload, version)
}

export async function getBjmaniaGitadoraBestScores() {
  const payload = await callGrpcUnary('/api/WebUI/GetGitadoraMBestScoreEx', new Uint8Array())
  return parseBestScoresResponse(payload)
}

export async function getBjmaniaRecentPlays() {
  const payload = await callGrpcUnary('/api/WebUI/GetRecentPlays', new Uint8Array())
  return parseRecentPlaysResponse(payload)
}

export async function loadBjmaniaGitadoraSnapshot() {
  const authUser = await getBjmaniaAuthMe()
  const profiles = await getBjmaniaProfiles()
  const gitadoraGame = profiles.profiles.find((profile) => profile.gameCode === GITADORA_GAME_CODE)
  const currentVersion = gitadoraGame?.gameVersions[0]

  if (typeof currentVersion !== 'number') {
    throw new Error('Could not resolve the current GITADORA version from GetProfiles')
  }

  const [gitadoraProfile, bestScores, recentPlays] = await Promise.all([
    getBjmaniaGitadoraProfile(currentVersion),
    getBjmaniaGitadoraBestScores(),
    getBjmaniaRecentPlays(),
  ])

  return {
    authUser,
    currentVersion,
    profiles,
    gitadoraProfile,
    bestScores,
    recentPlays,
  } satisfies BjmaniaGitadoraSnapshot
}

export function rankToLabel(rank: number) {
  return RANK_LABELS[rank] ?? `R${rank}`
}

export function rawPercentToText(rawPercent: number) {
  return `${(rawPercent / 100).toFixed(2)}%`
}

export function rawSkillToText(rawSkill: number) {
  return (rawSkill / 100).toFixed(2)
}

export function resolveScoreSheet(fumen: number): BjmaniaScoreSheet | null {
  if (fumen >= 1 && fumen <= 4) {
    const level = LEVEL_BY_INDEX[fumen]
    return level ? { instrument: 'drum', level, label: LEVEL_LABELS[level] } : null
  }

  if (fumen >= 5 && fumen <= 8) {
    const level = LEVEL_BY_INDEX[fumen - 4]
    return level ? { instrument: 'guitar', level, label: LEVEL_LABELS[level] } : null
  }

  if (fumen >= 9 && fumen <= 12) {
    const level = LEVEL_BY_INDEX[fumen - 8]
    return level ? { instrument: 'bass', level, label: LEVEL_LABELS[level] } : null
  }

  return null
}

function buildSongMap(songs: SongViewModel[]) {
  return new Map<number, SongViewModel>(songs.map((song) => [song.musicId, song]))
}

export function mapBestScoresToList(bestScores: BjmaniaBestScoreItem[], songs: SongViewModel[]) {
  const songMap = buildSongMap(songs)

  return bestScores
    .map((score): BjmaniaScoreListItem | null => {
      const sheet = resolveScoreSheet(score.fumen)

      if (!sheet) {
        return null
      }

      return {
        musicId: score.musicId,
        song: songMap.get(score.musicId) ?? null,
        instrument: sheet.instrument,
        level: sheet.level,
        sheetLabel: sheet.label,
        percRaw: score.percRaw,
        percText: rawPercentToText(score.percRaw),
        rank: score.rank,
        rankLabel: rankToLabel(score.rank),
        clear: score.clear,
        autoClear: score.autoClear,
        fullCombo: score.fullCombo,
        excellent: score.excellent,
        meter: score.meter,
        meterProg: score.meterProg,
      }
    })
    .filter((entry): entry is BjmaniaScoreListItem => entry !== null)
}

function normalizeBooleanValue(value: unknown) {
  return value === true || value === 1
}

function recentPayloadToSheet(payload: BjmaniaRecentPlayPayload | null) {
  if (!payload || typeof payload.Seq !== 'number') {
    return null
  }

  return resolveScoreSheet(payload.Seq)
}

export function mapRecentPlaysToList(recentPlays: BjmaniaRecentPlay[], songs: SongViewModel[]) {
  const songMap = buildSongMap(songs)

  return recentPlays.map((entry): BjmaniaRecentListItem => {
    const payload = entry.payload
    const musicId = typeof payload?.MusicId === 'number' ? payload.MusicId : null
    const song = musicId !== null ? (songMap.get(musicId) ?? null) : null
    const sheet = recentPayloadToSheet(payload)
    const rawPercent = typeof payload?.Perc === 'number' ? payload.Perc : null
    const rawScore = typeof payload?.Score === 'number' ? payload.Score : null
    const rank = typeof payload?.Rank === 'number' ? payload.Rank : 0
    const clear = normalizeBooleanValue(payload?.Clear)
    const fullCombo = normalizeBooleanValue(payload?.FullCombo)
    const excellent = normalizeBooleanValue(payload?.Excellent)
    let scoreText = rawScore !== null ? String(rawScore) : '--'

    if (excellent) {
      scoreText = `${scoreText} / EXC`
    } else if (fullCombo) {
      scoreText = `${scoreText} / FC`
    } else if (clear) {
      scoreText = `${scoreText} / CLR`
    }

    return {
      format: entry.format,
      timestamp: entry.timestamp,
      song,
      instrument: sheet?.instrument ?? null,
      level: sheet?.level ?? null,
      sheetLabel: sheet?.label ?? '--',
      percText: rawPercent !== null ? rawPercentToText(rawPercent) : '--',
      rankLabel: rankToLabel(rank),
      scoreText,
    }
  })
}

export function filterScoresByInstrument(scores: BjmaniaScoreListItem[], instrument: InstrumentKey) {
  return scores.filter((score) => score.instrument === instrument)
}

export function filterRecentByInstrument(recent: BjmaniaRecentListItem[], instrument: InstrumentKey) {
  return recent.filter((entry) => entry.instrument === instrument)
}
