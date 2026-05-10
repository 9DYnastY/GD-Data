import type { InstrumentKey, LevelKey } from '../types/song'
import type { DtxChartFile } from './chart-preview-types'

type DtxLevelFileMap = Partial<Record<LevelKey, DtxRemoteChartEntry>>
type DtxInstrumentFileMap = Partial<Record<InstrumentKey, DtxLevelFileMap>>

interface DtxRemoteChartEntry {
  url: string
  path: string
  fileName: string
  size: number
  sha256: string
  contentEncoding?: string
}

export interface DtxChartManifest {
  schemaVersion: 1
  publishedAt: string
  prefix: string
  musicCount: number
  chartCount: number
  charts: Record<string, DtxInstrumentFileMap>
}

interface CachedDtxChartManifestRecord {
  id: string
  schemaVersion: 1
  cachedAt: string
  manifest: DtxChartManifest
}

const DTX_MANIFEST_URL = 'https://gitadora.selundine.top/dtx/manifest.json'
const DTX_MANIFEST_CACHE_DB_NAME = 'gitadora-dtx-chart-manifest'
const DTX_MANIFEST_CACHE_DB_VERSION = 1
const DTX_MANIFEST_CACHE_STORE = 'manifests'
const DTX_MANIFEST_CACHE_KEY = 'current'
const LEVEL_ORDER: LevelKey[] = ['basic', 'advanced', 'extreme', 'master']
const INSTRUMENT_ORDER: InstrumentKey[] = ['drum', 'guitar', 'bass']

let activeManifest: DtxChartManifest | null = null
let manifestPromise: Promise<DtxChartManifest> | null = null

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isInstrumentKey(value: string): value is InstrumentKey {
  return value === 'drum' || value === 'guitar' || value === 'bass'
}

function isLevelKey(value: string): value is LevelKey {
  return value === 'basic' || value === 'advanced' || value === 'extreme' || value === 'master'
}

function normalizeRemoteChartEntry(value: unknown): DtxRemoteChartEntry | null {
  if (!isObject(value)) {
    return null
  }

  const url = value.url
  const path = value.path
  const fileName = value.fileName
  const size = value.size
  const sha256 = value.sha256
  const contentEncoding = value.contentEncoding

  if (
    typeof url !== 'string'
    || typeof path !== 'string'
    || typeof fileName !== 'string'
    || typeof size !== 'number'
    || typeof sha256 !== 'string'
  ) {
    return null
  }

  return {
    url,
    path,
    fileName,
    size,
    sha256,
    contentEncoding: typeof contentEncoding === 'string' ? contentEncoding : undefined,
  }
}

function normalizeManifest(value: unknown): DtxChartManifest {
  if (!isObject(value) || value.schemaVersion !== 1 || !isObject(value.charts)) {
    throw new Error('谱面库 manifest 格式无效')
  }

  const charts: Record<string, DtxInstrumentFileMap> = {}

  Object.entries(value.charts).forEach(([musicId, rawMusicEntry]) => {
    if (!/^\d+$/.test(musicId) || !isObject(rawMusicEntry)) {
      return
    }

    const instrumentMap: DtxInstrumentFileMap = {}

    Object.entries(rawMusicEntry).forEach(([instrument, rawInstrumentEntry]) => {
      if (!isInstrumentKey(instrument) || !isObject(rawInstrumentEntry)) {
        return
      }

      const levelMap: DtxLevelFileMap = {}

      Object.entries(rawInstrumentEntry).forEach(([level, rawChartEntry]) => {
        if (!isLevelKey(level)) {
          return
        }

        const chartEntry = normalizeRemoteChartEntry(rawChartEntry)

        if (chartEntry) {
          levelMap[level] = chartEntry
        }
      })

      if (Object.keys(levelMap).length > 0) {
        instrumentMap[instrument] = levelMap
      }
    })

    if (Object.keys(instrumentMap).length > 0) {
      charts[String(Number(musicId))] = instrumentMap
    }
  })

  return {
    schemaVersion: 1,
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : '',
    prefix: typeof value.prefix === 'string' ? value.prefix : 'dtx',
    musicCount: typeof value.musicCount === 'number' ? value.musicCount : Object.keys(charts).length,
    chartCount: typeof value.chartCount === 'number' ? value.chartCount : 0,
    charts,
  }
}

function openDtxChartManifestCacheDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(DTX_MANIFEST_CACHE_DB_NAME, DTX_MANIFEST_CACHE_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(DTX_MANIFEST_CACHE_STORE)) {
        db.createObjectStore(DTX_MANIFEST_CACHE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readCachedDtxChartManifest() {
  const db = await openDtxChartManifestCacheDb()

  if (!db) {
    return null
  }

  return await new Promise<DtxChartManifest | null>((resolve, reject) => {
    const transaction = db.transaction(DTX_MANIFEST_CACHE_STORE, 'readonly')
    const request = transaction.objectStore(DTX_MANIFEST_CACHE_STORE).get(DTX_MANIFEST_CACHE_KEY)

    request.onsuccess = () => {
      const record = request.result as CachedDtxChartManifestRecord | undefined

      if (!isObject(record) || record.id !== DTX_MANIFEST_CACHE_KEY || record.schemaVersion !== 1) {
        resolve(null)
        return
      }

      try {
        resolve(normalizeManifest(record.manifest))
      } catch {
        resolve(null)
      }
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function writeCachedDtxChartManifest(manifest: DtxChartManifest) {
  const db = await openDtxChartManifestCacheDb()

  if (!db) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DTX_MANIFEST_CACHE_STORE, 'readwrite')
    transaction.objectStore(DTX_MANIFEST_CACHE_STORE).put({
      id: DTX_MANIFEST_CACHE_KEY,
      schemaVersion: 1,
      cachedAt: new Date().toISOString(),
      manifest,
    } satisfies CachedDtxChartManifestRecord)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function fetchRemoteDtxChartManifest() {
  const response = await fetch(DTX_MANIFEST_URL, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`谱面库 manifest 加载失败 (${response.status})`)
  }

  const manifest = normalizeManifest(await response.json())

  try {
    await writeCachedDtxChartManifest(manifest)
  } catch {
    // Persistent caching is best effort; the in-memory manifest can still be used.
  }

  return manifest
}

export async function loadDtxChartManifest() {
  if (activeManifest) {
    return activeManifest
  }

  if (!manifestPromise) {
    manifestPromise = (async () => {
      const cachedManifest = await readCachedDtxChartManifest().catch(() => null)
      const manifest = cachedManifest ?? await fetchRemoteDtxChartManifest()
      activeManifest = manifest
      return manifest
    })().catch((error) => {
      manifestPromise = null
      throw error
    })
  }

  return await manifestPromise
}

export function preloadDtxChartManifest() {
  void loadDtxChartManifest().catch(() => {
    // The chart page will surface the network error if the user opens it later.
  })
}

export function getLoadedDtxChartManifest() {
  return activeManifest
}

export function hasLoadedDtxChartSet(musicId: number, manifest = activeManifest) {
  return Boolean(manifest?.charts[String(musicId)])
}

export async function hasDtxChartSet(musicId: number) {
  return hasLoadedDtxChartSet(musicId, await loadDtxChartManifest())
}

export function getAvailableDtxInstruments(musicId: number, manifest = activeManifest) {
  const chartSet = manifest?.charts[String(musicId)]

  if (!chartSet) {
    return []
  }

  return INSTRUMENT_ORDER.filter((instrument) => getAvailableDtxLevels(musicId, instrument, manifest).length > 0)
}

export function getAvailableDtxLevels(musicId: number, instrument: InstrumentKey, manifest = activeManifest) {
  const levelMap = manifest?.charts[String(musicId)]?.[instrument]

  if (!levelMap) {
    return []
  }

  return LEVEL_ORDER.filter((level) => Boolean(levelMap[level]))
}

export async function resolveDtxChart(
  musicId: number,
  instrument: InstrumentKey,
  level: LevelKey,
): Promise<DtxChartFile | null> {
  const manifest = await loadDtxChartManifest()
  const chartEntry = manifest.charts[String(musicId)]?.[instrument]?.[level]

  if (!chartEntry) {
    return null
  }

  return {
    musicId,
    title: String(musicId),
    instrument,
    level,
    url: chartEntry.url,
  }
}
