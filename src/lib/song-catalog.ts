import { computed, ref } from 'vue'
import { normalizeSong } from './song-normalizer'
import type { SongCatalogResponse, SongViewModel } from '../types/song'

const EMBEDDED_CATALOG_URL = '/song_list.json'
const SONG_LIST_MANIFEST_URL = 'https://gitadora.selundine.top/songlist/latest/songlist_version.json'
const SONG_LIST_MANIFEST_SCHEMA_VERSION = 1
const SONG_LIST_CACHE_DB_NAME = 'gddata-song-list'
const SONG_LIST_CACHE_DB_VERSION = 1
const SONG_LIST_CACHE_STORE = 'catalog'
const SONG_LIST_CACHE_KEY = 'active'
const SONG_LIST_FETCH_TIMEOUT_MS = 10000
const SONG_LIST_DOWNLOAD_TIMEOUT_MS = 120000
const SONG_LIST_SUCCESS_CLOSE_DELAY_MS = 1800

type SongCatalogSource = 'cache' | 'embedded'
type SongListUpdateState = 'idle' | 'checking' | 'downloading' | 'updated' | 'error'

export interface SongListVersionManifest {
  schemaVersion: 1
  catalogVersion: string
  publishedAt: string
  dataUrl: string
  dataSize: number
  dataSha256: string
  notes: string[]
}

interface CachedSongListRecord {
  id: typeof SONG_LIST_CACHE_KEY
  schemaVersion: 1
  catalogVersion: string
  publishedAt: string
  dataUrl: string
  dataSize: number
  dataSha256: string
  payloadText: string
  savedAt: number
}

interface ActiveSongCatalog {
  source: SongCatalogSource
  catalogVersion: string | null
  publishedAt: string | null
  dataUrl: string | null
  dataSize: number
  dataSha256: string
  payloadText: string
  songs: SongViewModel[]
}

interface SongListAvailableUpdate {
  manifest: SongListVersionManifest
  current: ActiveSongCatalog
}

type SongCatalogListener = (songs: SongViewModel[], catalog: ActiveSongCatalog) => void

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const songCatalogListeners = new Set<SongCatalogListener>()

let catalogPromise: Promise<ActiveSongCatalog> | null = null
let activeCatalog: ActiveSongCatalog | null = null
let activeUpdatePromise: Promise<SongListAvailableUpdate | null> | null = null
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

export const songListUpdateDialogVisible = ref(false)
export const availableSongListUpdate = ref<SongListAvailableUpdate | null>(null)
export const songListUpdateState = ref<SongListUpdateState>('idle')
export const songListUpdateBytes = ref(0)
export const songListUpdateTotalBytes = ref<number | null>(null)
export const songListUpdateError = ref('')

export const songListUpdateIsBusy = computed(() => (
  songListUpdateState.value === 'checking' || songListUpdateState.value === 'downloading'
))
export const songListUpdateProgressPercent = computed(() => {
  const totalBytes = songListUpdateTotalBytes.value

  if (!totalBytes || totalBytes <= 0) {
    return null
  }

  return Math.min(100, Math.max(0, Math.round((songListUpdateBytes.value / totalBytes) * 100)))
})
export const songListUpdateProgressRatio = computed(() => {
  const percent = songListUpdateProgressPercent.value
  return percent === null ? null : percent / 100
})
export const songListUpdateStatusMessage = computed(() => {
  switch (songListUpdateState.value) {
    case 'checking':
      return '正在检查曲库更新'
    case 'downloading':
      return '正在下载曲库'
    case 'updated':
      return '曲库已更新'
    case 'error':
      return '曲库更新失败'
    case 'idle':
    default:
      return ''
  }
})
export const songListUpdateProgressDetail = computed(() => {
  if (songListUpdateState.value === 'idle' || songListUpdateState.value === 'checking') {
    return ''
  }

  const bytes = songListUpdateBytes.value
  const totalBytes = songListUpdateTotalBytes.value

  if (totalBytes && totalBytes > 0) {
    return `${formatBytes(bytes)} / ${formatBytes(totalBytes)}`
  }

  return bytes > 0 ? `已处理 ${formatBytes(bytes)}` : ''
})

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function readString(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function parseSongListManifest(value: unknown): SongListVersionManifest {
  if (!isRecord(value)) {
    throw new Error('曲库版本信息格式不正确。')
  }

  const schemaVersion = parseNumber(value.schemaVersion)
  const catalogVersion = readString(value, 'catalogVersion')
  const publishedAt = readString(value, 'publishedAt')
  const dataUrl = readString(value, 'dataUrl')
  const dataSize = parseNumber(value.dataSize)
  const dataSha256 = readString(value, 'dataSha256').toLowerCase()
  const notes = normalizeNotes(value.notes)

  if (schemaVersion !== SONG_LIST_MANIFEST_SCHEMA_VERSION) {
    throw new Error('曲库版本信息不兼容。')
  }

  if (!catalogVersion || !publishedAt || !dataUrl || !dataSha256 || dataSize === null || dataSize <= 0) {
    throw new Error('曲库版本信息缺少必要字段。')
  }

  return {
    schemaVersion: SONG_LIST_MANIFEST_SCHEMA_VERSION,
    catalogVersion,
    publishedAt,
    dataUrl,
    dataSize,
    dataSha256,
    notes,
  }
}

function parseSongCatalogPayload(text: string): SongCatalogResponse {
  const payload = JSON.parse(text) as unknown

  if (!isRecord(payload) || !Array.isArray(payload.mdb_data)) {
    throw new Error('曲库数据格式不正确。')
  }

  return payload as unknown as SongCatalogResponse
}

function normalizeCatalogSongs(payload: SongCatalogResponse) {
  return payload.mdb_data.map((song, index) => normalizeSong(song, index))
}

async function sha256Hex(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前环境不支持 SHA-256 校验。')
  }

  const digestInput = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await globalThis.crypto.subtle.digest('SHA-256', digestInput)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function buildCatalogFromText(options: {
  payloadText: string
  source: SongCatalogSource
  catalogVersion?: string | null
  publishedAt?: string | null
  dataUrl?: string | null
  dataSha256?: string | null
}) {
  const payloadBytes = textEncoder.encode(options.payloadText)
  const dataSha256 = options.dataSha256 ?? await sha256Hex(payloadBytes)
  const payload = parseSongCatalogPayload(options.payloadText)

  return {
    source: options.source,
    catalogVersion: options.catalogVersion ?? null,
    publishedAt: options.publishedAt ?? null,
    dataUrl: options.dataUrl ?? null,
    dataSize: payloadBytes.byteLength,
    dataSha256,
    payloadText: options.payloadText,
    songs: normalizeCatalogSongs(payload),
  } satisfies ActiveSongCatalog
}

function openSongListCacheDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(SONG_LIST_CACHE_DB_NAME, SONG_LIST_CACHE_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(SONG_LIST_CACHE_STORE)) {
        db.createObjectStore(SONG_LIST_CACHE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readCachedSongListRecord() {
  const db = await openSongListCacheDb()

  if (!db) {
    return null
  }

  return await new Promise<CachedSongListRecord | null>((resolve, reject) => {
    const transaction = db.transaction(SONG_LIST_CACHE_STORE, 'readonly')
    const request = transaction.objectStore(SONG_LIST_CACHE_STORE).get(SONG_LIST_CACHE_KEY)

    request.onsuccess = () => resolve((request.result as CachedSongListRecord | undefined) ?? null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function writeCachedSongListRecord(record: CachedSongListRecord) {
  const db = await openSongListCacheDb()

  if (!db) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SONG_LIST_CACHE_STORE, 'readwrite')
    transaction.objectStore(SONG_LIST_CACHE_STORE).put(record)
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

async function clearCachedSongListRecord() {
  const db = await openSongListCacheDb()

  if (!db) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SONG_LIST_CACHE_STORE, 'readwrite')
    transaction.objectStore(SONG_LIST_CACHE_STORE).delete(SONG_LIST_CACHE_KEY)
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

function isValidCachedSongListRecord(record: unknown): record is CachedSongListRecord {
  if (!isRecord(record)) {
    return false
  }

  return (
    record.id === SONG_LIST_CACHE_KEY &&
    record.schemaVersion === SONG_LIST_MANIFEST_SCHEMA_VERSION &&
    typeof record.catalogVersion === 'string' &&
    typeof record.publishedAt === 'string' &&
    typeof record.dataUrl === 'string' &&
    typeof record.dataSize === 'number' &&
    typeof record.dataSha256 === 'string' &&
    typeof record.payloadText === 'string'
  )
}

async function loadCachedCatalog() {
  const record = await readCachedSongListRecord()

  if (!isValidCachedSongListRecord(record)) {
    return null
  }

  try {
    const payloadBytes = textEncoder.encode(record.payloadText)
    const actualSha256 = await sha256Hex(payloadBytes)

    if (actualSha256 !== record.dataSha256.toLowerCase() || payloadBytes.byteLength !== record.dataSize) {
      throw new Error('Cached song list validation failed.')
    }

    return await buildCatalogFromText({
      payloadText: record.payloadText,
      source: 'cache',
      catalogVersion: record.catalogVersion,
      publishedAt: record.publishedAt,
      dataUrl: record.dataUrl,
      dataSha256: actualSha256,
    })
  } catch {
    await clearCachedSongListRecord().catch(() => {})
    return null
  }
}

async function loadEmbeddedCatalog() {
  const response = await fetch(EMBEDDED_CATALOG_URL)

  if (!response.ok) {
    throw new Error(`无法加载曲库数据：${response.status}`)
  }

  return await buildCatalogFromText({
    payloadText: await response.text(),
    source: 'embedded',
  })
}

async function loadSongCatalogState() {
  if (activeCatalog) {
    return activeCatalog
  }

  if (!catalogPromise) {
    catalogPromise = (async () => {
      const cachedCatalog = await loadCachedCatalog()
      const nextCatalog = cachedCatalog ?? await loadEmbeddedCatalog()
      activeCatalog = nextCatalog
      return nextCatalog
    })()
  }

  return await catalogPromise
}

function notifySongCatalogUpdated(catalog: ActiveSongCatalog) {
  songCatalogListeners.forEach((listener) => {
    listener(catalog.songs, catalog)
  })
}

function applyActiveSongCatalog(catalog: ActiveSongCatalog, options?: { notify?: boolean }) {
  activeCatalog = catalog
  catalogPromise = Promise.resolve(catalog)

  if (options?.notify !== false) {
    notifySongCatalogUpdated(catalog)
  }
}

function compareCatalogVersions(left: string, right: string) {
  const leftParts = left.split(/[^0-9A-Za-z]+/).filter(Boolean)
  const rightParts = right.split(/[^0-9A-Za-z]+/).filter(Boolean)
  const partCount = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < partCount; index += 1) {
    const leftPart = leftParts[index] ?? ''
    const rightPart = rightParts[index] ?? ''
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null

    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
      return leftNumber > rightNumber ? 1 : -1
    }

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1
    }
  }

  return 0
}

function shouldApplySongListManifest(manifest: SongListVersionManifest, current: ActiveSongCatalog) {
  if (manifest.dataSha256 === current.dataSha256) {
    return false
  }

  if (current.source === 'cache' && current.catalogVersion) {
    return compareCatalogVersions(manifest.catalogVersion, current.catalogVersion) > 0
  }

  return true
}

async function fetchSongListManifest() {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), SONG_LIST_FETCH_TIMEOUT_MS)

  try {
    const url = new URL(SONG_LIST_MANIFEST_URL)
    url.searchParams.set('t', String(Date.now()))

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`曲库版本信息请求失败：${response.status}`)
    }

    return parseSongListManifest(await response.json())
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('曲库更新检查超时。')
    }

    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

function concatChunks(chunks: Uint8Array[], totalBytes: number) {
  const result = new Uint8Array(totalBytes)
  let offset = 0

  chunks.forEach((chunk) => {
    result.set(chunk, offset)
    offset += chunk.byteLength
  })

  return result
}

async function fetchSongListData(
  manifest: SongListVersionManifest,
  onProgress: (bytes: number, totalBytes: number | null) => void,
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), SONG_LIST_DOWNLOAD_TIMEOUT_MS)

  try {
    const response = await fetch(manifest.dataUrl, {
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`曲库下载失败：${response.status}`)
    }

    const contentLength = parseNumber(response.headers.get('Content-Length'))
    const expectedTotal = manifest.dataSize > 0 ? manifest.dataSize : contentLength

    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      onProgress(bytes.byteLength, expectedTotal)
      return bytes
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let receivedBytes = 0

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      if (value) {
        chunks.push(value)
        receivedBytes += value.byteLength
        onProgress(receivedBytes, expectedTotal)
      }
    }

    return concatChunks(chunks, receivedBytes)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('曲库下载超时。')
    }

    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function downloadAndApplySongListUpdate(manifest: SongListVersionManifest) {
  songListUpdateBytes.value = 0
  songListUpdateTotalBytes.value = manifest.dataSize

  const bytes = await fetchSongListData(manifest, (receivedBytes, totalBytes) => {
    songListUpdateBytes.value = receivedBytes
    songListUpdateTotalBytes.value = totalBytes
  })

  if (bytes.byteLength !== manifest.dataSize) {
    throw new Error('曲库文件大小校验失败。')
  }

  const actualSha256 = await sha256Hex(bytes)

  if (actualSha256 !== manifest.dataSha256) {
    throw new Error('曲库文件 SHA-256 校验失败。')
  }

  const payloadText = textDecoder.decode(bytes)
  const nextCatalog = await buildCatalogFromText({
    payloadText,
    source: 'cache',
    catalogVersion: manifest.catalogVersion,
    publishedAt: manifest.publishedAt,
    dataUrl: manifest.dataUrl,
    dataSha256: actualSha256,
  })

  await writeCachedSongListRecord({
    id: SONG_LIST_CACHE_KEY,
    schemaVersion: SONG_LIST_MANIFEST_SCHEMA_VERSION,
    catalogVersion: manifest.catalogVersion,
    publishedAt: manifest.publishedAt,
    dataUrl: manifest.dataUrl,
    dataSize: bytes.byteLength,
    dataSha256: actualSha256,
    payloadText,
    savedAt: Date.now(),
  })

  applyActiveSongCatalog(nextCatalog)
}

function resetSongListUpdateActionState() {
  songListUpdateBytes.value = 0
  songListUpdateTotalBytes.value = null
  songListUpdateError.value = ''
}

function clearAutoCloseTimer() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
}

function scheduleSongListUpdateDialogClose() {
  clearAutoCloseTimer()
  autoCloseTimer = setTimeout(() => {
    songListUpdateDialogVisible.value = false
    songListUpdateState.value = 'idle'
    resetSongListUpdateActionState()
    autoCloseTimer = null
  }, SONG_LIST_SUCCESS_CLOSE_DELAY_MS)
}

async function runSongListUpdateCheck() {
  if (typeof window === 'undefined') {
    return null
  }

  let manifest: SongListVersionManifest
  let current: ActiveSongCatalog

  try {
    manifest = await fetchSongListManifest()
    current = await loadSongCatalogState()
  } catch {
    return null
  }

  if (!shouldApplySongListManifest(manifest, current)) {
    return null
  }

  const update = { manifest, current } satisfies SongListAvailableUpdate
  availableSongListUpdate.value = update
  songListUpdateDialogVisible.value = true
  songListUpdateState.value = 'downloading'
  resetSongListUpdateActionState()

  try {
    await downloadAndApplySongListUpdate(manifest)
    songListUpdateState.value = 'updated'
    songListUpdateError.value = ''
    scheduleSongListUpdateDialogClose()
  } catch (error) {
    songListUpdateState.value = 'error'
    songListUpdateError.value = error instanceof Error && error.message
      ? error.message
      : '曲库更新失败，请稍后重试。'
  }

  return update
}

export function onSongCatalogUpdated(listener: SongCatalogListener) {
  songCatalogListeners.add(listener)

  return () => {
    songCatalogListeners.delete(listener)
  }
}

export function loadSongCatalog(): Promise<SongViewModel[]> {
  return loadSongCatalogState().then((catalog) => catalog.songs)
}

export async function loadSongByMusicId(musicId: number): Promise<SongViewModel | undefined> {
  const songs = await loadSongCatalog()
  return songs.find((song) => song.musicId === musicId)
}

export async function checkForSongListUpdate() {
  if (!activeUpdatePromise) {
    activeUpdatePromise = runSongListUpdateCheck().finally(() => {
      activeUpdatePromise = null
    })
  }

  return await activeUpdatePromise
}

export function closeSongListUpdateDialog() {
  if (songListUpdateIsBusy.value) {
    return
  }

  clearAutoCloseTimer()
  songListUpdateDialogVisible.value = false
  songListUpdateState.value = 'idle'
  resetSongListUpdateActionState()
}
