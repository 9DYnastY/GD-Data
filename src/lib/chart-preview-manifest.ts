import type { MdbIndex } from '../types/mdb'
import type { InstrumentKey, LevelKey } from '../types/song'
import { hasMdbChart, resolveMdbAudioUrl, resolveMdbChartUrl } from './mdb-assets'
import { getLoadedMdbIndex, getMdbSong, loadMdbIndex } from './mdb-index'
import type { DtxChartFile } from './chart-preview-types'

export type DtxChartManifest = MdbIndex

const LEVEL_ORDER: LevelKey[] = ['basic', 'advanced', 'extreme', 'master']
const INSTRUMENT_ORDER: InstrumentKey[] = ['drum', 'guitar', 'bass']

export async function loadDtxChartManifest() {
  return await loadMdbIndex()
}

export function preloadDtxChartManifest() {
  void loadMdbIndex().catch(() => {
    // The chart page will surface the network error if the user opens it later.
  })
}

export function hasLoadedDtxChartSet(musicId: number, manifest = getLoadedMdbIndex()) {
  const song = manifest ? getMdbSong(manifest, musicId) : null
  return INSTRUMENT_ORDER.some((instrument) => (
    LEVEL_ORDER.some((level) => hasMdbChart(song, instrument, level))
  ))
}

export async function hasDtxChartSet(musicId: number) {
  return hasLoadedDtxChartSet(musicId, await loadMdbIndex())
}

export function getAvailableDtxInstruments(
  musicId: number,
  manifest = getLoadedMdbIndex(),
) {
  const song = manifest ? getMdbSong(manifest, musicId) : null

  return INSTRUMENT_ORDER.filter((instrument) => (
    LEVEL_ORDER.some((level) => hasMdbChart(song, instrument, level))
  ))
}

export function getAvailableDtxLevels(
  musicId: number,
  instrument: InstrumentKey,
  manifest = getLoadedMdbIndex(),
) {
  const song = manifest ? getMdbSong(manifest, musicId) : null
  return LEVEL_ORDER.filter((level) => hasMdbChart(song, instrument, level))
}

export function hasDtxChartAudio(
  musicId: number,
  instrument: InstrumentKey,
  level: LevelKey,
  manifest = getLoadedMdbIndex(),
) {
  return Boolean(manifest && resolveMdbAudioUrl(manifest, musicId, instrument, level))
}

export async function resolveDtxChart(
  musicId: number,
  instrument: InstrumentKey,
  level: LevelKey,
): Promise<DtxChartFile | null> {
  const manifest = await loadMdbIndex()
  const url = resolveMdbChartUrl(manifest, musicId, instrument, level)

  if (!url) {
    return null
  }

  return {
    musicId,
    title: String(musicId),
    instrument,
    level,
    url,
    audioUrl: resolveMdbAudioUrl(manifest, musicId, instrument, level),
  }
}
