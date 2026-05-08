import type { InstrumentKey, LevelKey } from '../types/song'
import { resolveDtxChart } from './chart-preview-manifest'
import { DtxFileParser } from './chart-preview-parser'
import { DtxCanvasPositioner } from './chart-preview-positioner'
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

export async function loadDtxChartPreview(
  musicId: number,
  instrument: InstrumentKey,
  level: LevelKey,
  speed = 1,
  chartMode: DtxChartMode = 'XG/Gitadora',
): Promise<LoadedDtxChartPreview> {
  const chart = resolveDtxChart(musicId, instrument, level)

  if (!chart) {
    throw new Error('暂未收录该谱面预览')
  }

  const response = await fetch(chart.url, { cache: 'force-cache' })

  if (!response.ok) {
    throw new Error(`谱面文件加载失败 (${response.status})`)
  }

  const parser = new DtxFileParser(await response.text())
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
    isLevelShown: true,
  }
  const dtxJson = parser.getDtxJson()
  const positioner = new DtxCanvasPositioner(dtxJson, drawingConfig)

  return {
    chart,
    dtxJson,
    drawingConfig,
    canvasData: positioner.getCanvasDataForDrawing(),
  }
}
