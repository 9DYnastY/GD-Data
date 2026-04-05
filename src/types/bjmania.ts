import type { InstrumentKey, LevelKey, SongViewModel } from './song'

export type BjmaniaScoreFamily = 'dm' | 'gf'
export type BjmaniaScoreHotFilter = 'all' | 'hot' | 'other'
export type BjmaniaScoreFilterKey = 'current' | 'skill' | 'deleted' | 'classic' | 'non-classic'
export type BjmaniaScoreSortKey =
  | 'skill-desc'
  | 'skill-asc'
  | 'rate-desc'
  | 'rate-asc'
  | 'difficulty-asc'
  | 'difficulty-desc'

export interface BjmaniaCaptchaToken {
  ticket: string
  randstr: string
}

export interface BjmaniaLoginPayload {
  email: string
  password: string
  remember: boolean
  captcha: BjmaniaCaptchaToken
}

export interface BjmaniaAuthUser {
  id: string
  name: string
  email: string
  ip?: string
  rk?: string
  social?: Record<string, boolean>
  avatar?: {
    type: string
    key: string
  }
}

export interface BjmaniaGameProfile {
  gameCode: string
  gameVersions: number[]
}

export interface BjmaniaProfilesResponse {
  profiles: BjmaniaGameProfile[]
  status: number
}

export interface BjmaniaProfileSticker {
  stickerId: number
  posX: number
  posY: number
  scaleX: number
  scaleY: number
  rotate: number
}

export interface BjmaniaGitadoraProfile {
  name: string
  title: string
  stickers: BjmaniaProfileSticker[]
  status: number
  version: number
  gfSkillRaw: number
  gfAllSkillRaw: number
  gfRank: number
  gfAllUser: number
  dmSkillRaw: number
  dmAllSkillRaw: number
  dmRank: number
  dmAllUser: number
}

export interface BjmaniaBestScoreItem {
  musicId: number
  fumen: number
  percRaw: number
  rank: number
  autoClear: boolean
  clear: boolean
  fullCombo: boolean
  excellent: boolean
  meter: string
  meterProg: number
}

export interface BjmaniaBestScoresResponse {
  bestScores: BjmaniaBestScoreItem[]
  status: number
}

export interface BjmaniaRecentPlayEntry {
  format: string
  content: string
  timestamp: number
  comment: string
}

export interface BjmaniaRecentPlayPayload {
  CabinetInfo?: string
  GameSpec?: string
  GitadoraVersion?: number
  Name?: string
  Title?: string
  PlayerSkill?: number
  MusicId?: number
  Seq?: number
  Skill?: number
  NewSkill?: number
  Clear?: boolean | number
  AutoClear?: boolean | number
  FullCombo?: boolean | number
  Excellent?: boolean | number
  Perc?: number
  NewPerc?: number
  Rank?: number
  Meter?: string | number
  MeterProg?: number
  Score?: number
  Combo?: number
  Medal?: number
  [key: string]: unknown
}

export interface BjmaniaRecentPlay {
  format: string
  content: string
  timestamp: number
  comment: string
  payload: BjmaniaRecentPlayPayload | null
}

export interface BjmaniaRecentPlaysResponse {
  recentPlayEntries: BjmaniaRecentPlay[]
}

export interface BjmaniaGitadoraSnapshot {
  authUser: BjmaniaAuthUser
  currentVersion: number
  profiles: BjmaniaProfilesResponse
  gitadoraProfile: BjmaniaGitadoraProfile
  bestScores: BjmaniaBestScoresResponse
  recentPlays: BjmaniaRecentPlaysResponse
  hotMusicIds: number[]
}

export interface BjmaniaScoreSheet {
  family: BjmaniaScoreFamily
  instrument: InstrumentKey
  level: LevelKey
  label: string
  branchLabel: string | null
  skillFumen: number
}

export interface BjmaniaScoreListItem {
  musicId: number
  song: SongViewModel | null
  family: BjmaniaScoreFamily
  instrument: InstrumentKey
  branchLabel: string | null
  level: LevelKey
  sheetLabel: string
  percRaw: number
  percText: string
  rank: number
  rankLabel: string
  clear: boolean
  autoClear: boolean
  fullCombo: boolean
  excellent: boolean
  difficultyRaw: number
  difficultyText: string
  skillCalcRaw: number
  skillCalcText: string
  isHot: boolean
  isDeleted: boolean
  isClassic: boolean
  inSkill: boolean
  searchText: string
}

export interface BjmaniaRecentListItem {
  format: string
  timestamp: number
  song: SongViewModel | null
  family: BjmaniaScoreFamily | null
  instrument: InstrumentKey | null
  branchLabel: string | null
  level: LevelKey | null
  sheetLabel: string
  percText: string
  rankLabel: string
  scoreText: string
}
