import type { MdbIndex, MdbInstrumentCode, MdbLevelCode, MdbSongRecord } from '../types/mdb'

const MDB_BASE_URL = (import.meta.env.VITE_MDB_BASE_URL || 'https://gddata-mdb.selundine.top')
  .replace(/\/+$/, '')
const MDB_INDEX_URL = `${MDB_BASE_URL}/mdb.json`
const MDB_CACHE_DB_NAME = 'gddata-mdb-index'
const MDB_CACHE_DB_VERSION = 1
const MDB_CACHE_STORE = 'indexes'
const MDB_CACHE_KEY = 'current'
const INSTRUMENT_CODES = new Set<MdbInstrumentCode>(['d', 'g', 'b'])
const LEVEL_CODES = new Set<MdbLevelCode>(['nov', 'bsc', 'adv', 'ext', 'mst'])

interface CachedMdbIndexRecord {
  id: typeof MDB_CACHE_KEY
  savedAt: number
  index: MdbIndex
}

let activeIndex: MdbIndex | null = null
let indexPromise: Promise<MdbIndex> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readOptionalString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseCharts(value: unknown): MdbSongRecord['charts'] {
  if (!isRecord(value)) {
    throw new Error('MDB song charts must be an object.')
  }

  const charts: MdbSongRecord['charts'] = {}

  Object.entries(value).forEach(([instrument, rawLevels]) => {
    if (!INSTRUMENT_CODES.has(instrument as MdbInstrumentCode) || !Array.isArray(rawLevels)) {
      return
    }

    const levels = rawLevels.filter((level): level is MdbLevelCode => (
      typeof level === 'string' && LEVEL_CODES.has(level as MdbLevelCode)
    ))

    if (levels.length > 0) {
      charts[instrument as MdbInstrumentCode] = [...new Set(levels)]
    }
  })

  return charts
}

function parseAudio(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error('MDB song audio must be an array.')
  }

  return [...new Set(value.filter((instrument): instrument is MdbInstrumentCode => (
    typeof instrument === 'string' && INSTRUMENT_CODES.has(instrument as MdbInstrumentCode)
  )))]
}

function parseSongRecord(musicIdKey: string, value: unknown): MdbSongRecord {
  if (!isRecord(value)) {
    throw new Error(`MDB song ${musicIdKey} must be an object.`)
  }

  const musicId = value.music_id

  if (!Number.isInteger(musicId) || Number(musicIdKey) !== musicId) {
    throw new Error(`MDB song ${musicIdKey} has an invalid music_id.`)
  }

  if (typeof value.cover !== 'boolean') {
    throw new Error(`MDB song ${musicIdKey} has an invalid cover flag.`)
  }

  return {
    music_id: musicId as number,
    remy_artist: readOptionalString(value, 'remy_artist'),
    remy_url: readOptionalString(value, 'remy_url'),
    remy_length: readOptionalString(value, 'remy_length'),
    cover: value.cover,
    audio: parseAudio(value.audio),
    charts: parseCharts(value.charts),
  }
}

export function parseMdbIndex(value: unknown): MdbIndex {
  if (!isRecord(value) || value.schema !== 1 || !isRecord(value.songs)) {
    throw new Error('MDB index format is invalid.')
  }

  const revision = readOptionalString(value, 'revision')
  const count = value.count

  if (!revision || !Number.isInteger(count) || (count as number) < 0) {
    throw new Error('MDB index is missing revision or count.')
  }

  const songs = Object.fromEntries(
    Object.entries(value.songs).map(([musicId, song]) => [musicId, parseSongRecord(musicId, song)]),
  )

  if (Object.keys(songs).length !== count) {
    throw new Error(`MDB index count mismatch: expected ${count}, received ${Object.keys(songs).length}.`)
  }

  return {
    schema: 1,
    revision,
    count: count as number,
    songs,
  }
}

function openMdbCacheDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(MDB_CACHE_DB_NAME, MDB_CACHE_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(MDB_CACHE_STORE)) {
        db.createObjectStore(MDB_CACHE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readCachedMdbIndex() {
  const db = await openMdbCacheDb()

  if (!db) {
    return null
  }

  return await new Promise<MdbIndex | null>((resolve, reject) => {
    const transaction = db.transaction(MDB_CACHE_STORE, 'readonly')
    const request = transaction.objectStore(MDB_CACHE_STORE).get(MDB_CACHE_KEY)

    request.onsuccess = () => {
      const record = request.result as CachedMdbIndexRecord | undefined

      try {
        resolve(record?.id === MDB_CACHE_KEY ? parseMdbIndex(record.index) : null)
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

async function writeCachedMdbIndex(index: MdbIndex) {
  const db = await openMdbCacheDb()

  if (!db) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(MDB_CACHE_STORE, 'readwrite')
    transaction.objectStore(MDB_CACHE_STORE).put({
      id: MDB_CACHE_KEY,
      savedAt: Date.now(),
      index,
    } satisfies CachedMdbIndexRecord)
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

async function fetchMdbIndex() {
  const response = await fetch(MDB_INDEX_URL, { cache: 'no-cache' })

  if (!response.ok) {
    throw new Error(`MDB index request failed (${response.status}).`)
  }

  return parseMdbIndex(await response.json())
}

export async function loadMdbIndex() {
  if (activeIndex) {
    return activeIndex
  }

  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        const index = await fetchMdbIndex()
        activeIndex = index
        void writeCachedMdbIndex(index).catch(() => {})
        return index
      } catch (remoteError) {
        const cachedIndex = await readCachedMdbIndex().catch(() => null)

        if (cachedIndex) {
          activeIndex = cachedIndex
          return cachedIndex
        }

        throw remoteError
      }
    })().catch((error) => {
      indexPromise = null
      throw error
    })
  }

  return await indexPromise
}

export function getLoadedMdbIndex() {
  return activeIndex
}

export function getMdbSong(index: MdbIndex, musicId: number) {
  return index.songs[String(musicId).padStart(4, '0')] ?? null
}

export { MDB_BASE_URL, MDB_INDEX_URL }
