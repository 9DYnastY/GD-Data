import type { InstrumentKey, LevelKey } from '../types/song'
import { resolveDtxChart } from './chart-preview-manifest'
import { DtxFileParser } from './chart-preview-parser'
import type { DtxChartMode, DtxDifficultyLabel, DtxDrawingConfig, DtxGameMode, LoadedDtxChartPreview } from './chart-preview-types'

const GAME_MODE_BY_INSTRUMENT: Record<InstrumentKey, DtxGameMode> = {
  drum: 'Drum',
  guitar: 'Guitar',
  bass: 'Bass',
}

const DIFFICULTY_LABEL_BY_LEVEL: Record<LevelKey, DtxDifficultyLabel> = {
  basic: 'Basic',
  advanced: 'Advanced',
  extreme: 'Extreme',
  master: 'Master',
}

export function getDtxGameMode(instrument: InstrumentKey) {
  return GAME_MODE_BY_INSTRUMENT[instrument]
}

export function getDtxDifficultyLabel(level: LevelKey) {
  return DIFFICULTY_LABEL_BY_LEVEL[level]
}

function decodeDtxText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)

  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes)
  }

  try {
    return new TextDecoder('shift_jis').decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

export async function loadDtxChartPreview(
  musicId: number,
  instrument: InstrumentKey,
  level: LevelKey,
  speed = 1,
  chartMode: DtxChartMode = 'XG/Gitadora',
  reverse = false,
): Promise<LoadedDtxChartPreview> {
  const chart = await resolveDtxChart(musicId, instrument, level)

  if (!chart) {
    throw new Error('暂未收录该谱面预览')
  }

  const response = await fetch(chart.url, { cache: 'force-cache' })

  if (!response.ok) {
    throw new Error(`谱面文件加载失败 (${response.status})`)
  }

  const parser = new DtxFileParser(decodeDtxText(await response.arrayBuffer()))
  const parserError = parser.getErrorMessage()

  if (parserError) {
    throw new Error(parserError)
  }

  const drawingConfig: DtxDrawingConfig = {
    difficultyLabel: getDtxDifficultyLabel(level),
    scale: speed,
    maxHeight: 2000,
    chartMode,
    gameMode: getDtxGameMode(instrument),
    reverse: instrument === 'drum' ? true : reverse,
    isLevelShown: true,
  }
  const dtxJson = parser.getDtxJson()

  return {
    chart,
    dtxJson,
    drawingConfig,
    canvasData: [],
  }
}
