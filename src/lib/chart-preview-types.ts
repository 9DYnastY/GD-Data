import type { InstrumentKey, LevelKey } from '../types/song'

export type DtxGameMode = 'Drum' | 'Guitar' | 'Bass'
export type DtxChartMode = 'XG/Gitadora' | 'Classic' | 'Full'
export type DtxDifficultyLabel = 'Basic' | 'Advanced' | 'Extreme' | 'Master' | 'Real'

export interface DtxLine {
  barNumber: number
  lineNumberInBar: number
  timePosition: number
}

export interface DtxChip {
  lineTimePosition: DtxLine
  chipCode: string
  laneType: string
  endLineTimePosition?: DtxLine
}

export interface DtxBar {
  lineCount: number
  startTimePos: number
  duration: number
}

export interface DtxBpmSegment {
  bpm: number
  startBarNum: number
  startLineNum: number
  startTimePos: number
  duration: number
}

export interface DtxSongInfo {
  title: string
  artist: string
  comment: string
  difficultyLevelDrum: number
  difficultyLevelGuitar: number
  difficultyLevelBass: number
  songDuration: number
  noteCountDrum: number
  noteCountGuitar: number
  noteCountBass: number
}

export interface DtxJson {
  songInfo: DtxSongInfo
  chips: DtxChip[]
  bars: DtxBar[]
  quarterBarLines: DtxLine[]
  bpmSegments: DtxBpmSegment[]
  laneChipCounter: Record<string, number>
}

export interface DtxRect {
  posX: number
  posY: number
  width: number
  height: number
}

export interface DtxChipPixelRectPos {
  laneType: string
  rectPos: DtxRect
}

export interface DtxImageRectPos {
  name: string
  rectPos: DtxRect
}

export interface DtxTextRectPos {
  color: string
  rectPos: DtxRect
  text: string
  fontSize: number
  fontFamily: string
  fontWeight: number
}

export interface DtxCanvasData {
  chipPositions: DtxChipPixelRectPos[]
  textPositions: DtxTextRectPos[]
  frameRect: DtxRect[]
  holdNoteRect: DtxImageRectPos[]
  images: DtxImageRectPos[]
  canvasSize: {
    width: number
    height: number
  }
}

export interface DtxDrawingConfig {
  difficultyLabel: DtxDifficultyLabel
  scale: number
  maxHeight: number
  barsPerColumn?: number
  chartMode: DtxChartMode
  gameMode: DtxGameMode
  reverse: boolean
  isLevelShown: boolean
}

export interface DtxChartFile {
  musicId: number
  title: string
  instrument: InstrumentKey
  level: LevelKey
  url: string
}

export interface LoadedDtxChartPreview {
  chart: DtxChartFile
  dtxJson: DtxJson
  canvasData: DtxCanvasData[]
  drawingConfig: DtxDrawingConfig
}

export const EMPTY_DTX_JSON: DtxJson = {
  songInfo: {
    title: '',
    artist: '',
    comment: '',
    difficultyLevelDrum: 0,
    difficultyLevelGuitar: 0,
    difficultyLevelBass: 0,
    songDuration: 0,
    noteCountDrum: 0,
    noteCountGuitar: 0,
    noteCountBass: 0,
  },
  chips: [],
  bars: [],
  quarterBarLines: [],
  bpmSegments: [],
  laneChipCounter: {},
}
