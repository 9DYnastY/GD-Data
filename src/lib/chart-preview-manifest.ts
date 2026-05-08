import type { InstrumentKey, LevelKey } from '../types/song'
import type { DtxChartFile } from './chart-preview-types'

type DtxLevelFileMap = Partial<Record<LevelKey, string>>
type DtxInstrumentFileMap = Record<InstrumentKey, DtxLevelFileMap>

interface DtxChartSet {
  musicId: number
  title: string
  charts: DtxInstrumentFileMap
}

const LEVEL_ORDER: LevelKey[] = ['basic', 'advanced', 'extreme', 'master']

const DTX_CHART_SETS: Record<number, DtxChartSet> = {
  2933: {
    musicId: 2933,
    title: 'GALAXY WAVE',
    charts: {
      drum: {
        basic: '/dtx/2933/bsc.dtx',
        advanced: '/dtx/2933/adv.dtx',
        extreme: '/dtx/2933/ext.dtx',
        master: '/dtx/2933/mst.dtx',
      },
      guitar: {
        basic: '/dtx/2933/g_bsc.dtx',
        advanced: '/dtx/2933/g_adv.dtx',
        extreme: '/dtx/2933/g_ext.dtx',
        master: '/dtx/2933/g_mst.dtx',
      },
      bass: {
        basic: '/dtx/2933/g_bsc.dtx',
        advanced: '/dtx/2933/g_adv.dtx',
        extreme: '/dtx/2933/g_ext.dtx',
        master: '/dtx/2933/g_mst.dtx',
      },
    },
  },
}

export function hasDtxChartSet(musicId: number) {
  return Boolean(DTX_CHART_SETS[musicId])
}

export function getAvailableDtxInstruments(musicId: number) {
  const chartSet = DTX_CHART_SETS[musicId]

  if (!chartSet) {
    return []
  }

  return (Object.keys(chartSet.charts) as InstrumentKey[])
    .filter((instrument) => getAvailableDtxLevels(musicId, instrument).length > 0)
}

export function getAvailableDtxLevels(musicId: number, instrument: InstrumentKey) {
  const chartSet = DTX_CHART_SETS[musicId]
  const levelMap = chartSet?.charts[instrument]

  if (!levelMap) {
    return []
  }

  return LEVEL_ORDER.filter((level) => Boolean(levelMap[level]))
}

export function resolveDtxChart(musicId: number, instrument: InstrumentKey, level: LevelKey): DtxChartFile | null {
  const chartSet = DTX_CHART_SETS[musicId]
  const url = chartSet?.charts[instrument]?.[level]

  if (!chartSet || !url) {
    return null
  }

  return {
    musicId: chartSet.musicId,
    title: chartSet.title,
    instrument,
    level,
    url,
  }
}

