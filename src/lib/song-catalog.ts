import { computed, ref } from 'vue'
import { parseMdbBinary } from './mdb-parser'
import { normalizeSong } from './song-normalizer'
import type { RawSong, SongCatalogResponse, SongViewModel } from '../types/song'

const MDB_MANIFEST_URL = '/mdb/m32_manifest.json'
const EMBEDDED_ENRICHMENT_URL = '/song_enrichment.json'
const REMOTE_ENRICHMENT_URL = 'https://gitadora.selundine.top/songlist/latest/song_enrichment.json'
const SONG_LIST_CACHE_DB_NAME = 'gddata-song-list'
const SONG_LIST_CACHE_DB_VERSION = 2
const SONG_LIST_CACHE_STORE = 'catalog'
const SONG_LIST_CACHE_KEY = 'enrichment'
const SONG_LIST_DOWNLOAD_TIMEOUT_MS = 120000
const SONG_LIST_SUCCESS_CLOSE_DELAY_MS = 1800

type SongListUpdateState = 'idle' | 'checking' | 'downloading' | 'updated' | 'error'
type EnrichmentSource = 'cache' | 'embedded' | 'remote'
type SongCatalogListenerTarget = number | 'all' | 'default'

interface MdbVersionManifest {
  schemaVersion: 1
  game: 'M32'
  latest: number
  versions: number[]
  files: Record<string, string>
}

type SongEnrichmentRecord = Partial<Pick<
  RawSong,
  'remy_title' | 'remy_artist' | 'remy_url' | 'remy_imageUrl' | 'remy_length' | 'remy_bpm'
>>

interface SongEnrichmentPayload {
  schemaVersion: 1
  catalogVersion: string
  publishedAt: string | null
  notes: string[]
  records: Record<string, SongEnrichmentRecord>
}

export interface SongListVersionManifest {
  schemaVersion: 1
  catalogVersion: string
  publishedAt: string
  dataUrl: string
  dataSize: number
  dataSha256: string
  notes: string[]
}

interface CachedSongEnrichmentRecord {
  id: typeof SONG_LIST_CACHE_KEY
  schemaVersion: 1
  catalogVersion: string
  publishedAt: string | null
  dataUrl: string
  dataSize: number
  dataSha256: string
  payloadText: string
  savedAt: number
}

interface ActiveEnrichment {
  source: EnrichmentSource
  catalogVersion: string
  publishedAt: string | null
  dataUrl: string | null
  dataSize: number
  dataSha256: string
  payloadText: string
  payload: SongEnrichmentPayload
}

export interface ActiveSongCatalog {
  source: 'local-mdb'
  mdbVersion: number
  mdbUrl: string
  isDefaultVersion: boolean
  enrichmentSource: EnrichmentSource
  catalogVersion: string
  publishedAt: string | null
  dataUrl: string | null
  dataSize: number
  dataSha256: string
  songs: SongViewModel[]
}

interface SongListAvailableUpdate {
  manifest: SongListVersionManifest
  current: ActiveSongCatalog
}

type SongCatalogListener = (songs: SongViewModel[], catalog: ActiveSongCatalog) => void

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const songCatalogListeners = new Map<SongCatalogListener, SongCatalogListenerTarget>()
const catalogPromiseCache = new Map<number, Promise<ActiveSongCatalog>>()
const activeCatalogs = new Map<number, ActiveSongCatalog>()
const loadedCatalogVersions = new Set<number>()

let mdbManifestPromise: Promise<MdbVersionManifest> | null = null
let enrichmentPromise: Promise<ActiveEnrichment> | null = null
let activeEnrichment: ActiveEnrichment | null = null
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
      return '正在检查曲库增强信息'
    case 'downloading':
      return '正在下载曲库增强信息'
    case 'updated':
      return '曲库增强信息已更新'
    case 'error':
      return '曲库增强信息更新失败'
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

function readNullableString(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function parseMdbManifest(value: unknown): MdbVersionManifest {
  if (!isRecord(value)) {
    throw new Error('本地 MDB 版本信息格式不正确。')
  }

  const schemaVersion = parseNumber(value.schemaVersion)
  const game = readString(value, 'game')
  const latest = parseNumber(value.latest)
  const versions = Array.isArray(value.versions)
    ? value.versions.map(parseNumber).filter((version): version is number => Number.isFinite(version))
    : []
  const files = isRecord(value.files)
    ? Object.fromEntries(
        Object.entries(value.files).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      )
    : {}

  if (schemaVersion !== 1 || game !== 'M32' || !Number.isFinite(latest) || versions.length === 0) {
    throw new Error('本地 MDB 版本信息缺少必要字段。')
  }

  versions.forEach((version) => {
    if (!files[String(version)]) {
      throw new Error(`本地 MDB 版本 ${version} 缺少文件路径。`)
    }
  })

  return {
    schemaVersion: 1,
    game: 'M32',
    latest: latest as number,
    versions: [...new Set(versions)].sort((left, right) => left - right),
    files,
  }
}

async function loadMdbManifest() {
  if (!mdbManifestPromise) {
    mdbManifestPromise = fetch(MDB_MANIFEST_URL).then(async (response) => {
      if (!response.ok) {
        throw new Error(`无法加载本地 MDB 版本信息：${response.status}`)
      }

      return parseMdbManifest(await response.json())
    })
  }

  return await mdbManifestPromise
}

function resolveMdbVersion(manifest: MdbVersionManifest, requestedVersion?: number | null) {
  if (typeof requestedVersion === 'number' && Number.isFinite(requestedVersion)) {
    if (!manifest.versions.includes(requestedVersion)) {
      throw new Error(`当前安装包不支持 GITADORA 版本 ${requestedVersion}。`)
    }

    return requestedVersion
  }

  return manifest.latest
}

export async function getLocalMdbVersions() {
  const manifest = await loadMdbManifest()
  return [...manifest.versions]
}

export async function resolveAvailableLocalMdbVersions(gameVersions: number[]) {
  const manifest = await loadMdbManifest()
  const ownedVersions = new Set(gameVersions.filter((version) => Number.isFinite(version)))
  return manifest.versions.filter((version) => ownedVersions.has(version))
}

export async function getDefaultLocalMdbVersion() {
  const manifest = await loadMdbManifest()
  return manifest.latest
}

function parseSongEnrichmentRecord(value: unknown): SongEnrichmentRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const record: SongEnrichmentRecord = {}
  const remyTitle = readNullableString(value, 'remy_title')
  const remyArtist = readNullableString(value, 'remy_artist')
  const remyUrl = readNullableString(value, 'remy_url')
  const remyImageUrl = readNullableString(value, 'remy_imageUrl')
  const remyLength = readNullableString(value, 'remy_length')
  const remyBpm = parseNumber(value.remy_bpm)

  if (remyTitle) record.remy_title = remyTitle
  if (remyArtist) record.remy_artist = remyArtist
  if (remyUrl) record.remy_url = remyUrl
  if (remyImageUrl) record.remy_imageUrl = remyImageUrl
  if (remyLength) record.remy_length = remyLength
  if (remyBpm !== null) record.remy_bpm = remyBpm

  return Object.keys(record).length > 0 ? record : null
}

function parseSongEnrichmentPayload(value: unknown): SongEnrichmentPayload {
  if (!isRecord(value) || !isRecord(value.records)) {
    throw new Error('曲库增强信息格式不正确。')
  }

  const schemaVersion = parseNumber(value.schemaVersion)

  if (schemaVersion !== 1) {
    throw new Error('曲库增强信息版本不兼容。')
  }

  const records: Record<string, SongEnrichmentRecord> = {}
  Object.entries(value.records).forEach(([musicId, rawRecord]) => {
    if (!/^\d+$/.test(musicId)) {
      return
    }

    const record = parseSongEnrichmentRecord(rawRecord)
    if (record) {
      records[musicId] = record
    }
  })

  return {
    schemaVersion: 1,
    catalogVersion: readString(value, 'catalogVersion') || 'unknown',
    publishedAt: readNullableString(value, 'publishedAt'),
    notes: normalizeNotes(value.notes),
    records,
  }
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

async function buildEnrichmentFromText(options: {
  payloadText: string
  source: EnrichmentSource
  dataUrl?: string | null
  dataSha256?: string | null
}) {
  const payloadBytes = textEncoder.encode(options.payloadText)
  const payload = parseSongEnrichmentPayload(JSON.parse(options.payloadText) as unknown)
  const dataSha256 = options.dataSha256 ?? await sha256Hex(payloadBytes)

  return {
    source: options.source,
    catalogVersion: payload.catalogVersion,
    publishedAt: payload.publishedAt,
    dataUrl: options.dataUrl ?? null,
    dataSize: payloadBytes.byteLength,
    dataSha256,
    payloadText: options.payloadText,
    payload,
  } satisfies ActiveEnrichment
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

async function readCachedEnrichmentRecord() {
  const db = await openSongListCacheDb()

  if (!db) {
    return null
  }

  return await new Promise<CachedSongEnrichmentRecord | null>((resolve, reject) => {
    const transaction = db.transaction(SONG_LIST_CACHE_STORE, 'readonly')
    const request = transaction.objectStore(SONG_LIST_CACHE_STORE).get(SONG_LIST_CACHE_KEY)

    request.onsuccess = () => resolve((request.result as CachedSongEnrichmentRecord | undefined) ?? null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

async function writeCachedEnrichmentRecord(record: CachedSongEnrichmentRecord) {
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

async function clearCachedEnrichmentRecord() {
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

function isValidCachedEnrichmentRecord(record: unknown): record is CachedSongEnrichmentRecord {
  if (!isRecord(record)) {
    return false
  }

  return (
    record.id === SONG_LIST_CACHE_KEY &&
    record.schemaVersion === 1 &&
    typeof record.catalogVersion === 'string' &&
    (typeof record.publishedAt === 'string' || record.publishedAt === null) &&
    typeof record.dataUrl === 'string' &&
    typeof record.dataSize === 'number' &&
    typeof record.dataSha256 === 'string' &&
    typeof record.payloadText === 'string'
  )
}

async function loadCachedEnrichment() {
  const record = await readCachedEnrichmentRecord()

  if (!isValidCachedEnrichmentRecord(record)) {
    return null
  }

  try {
    const payloadBytes = textEncoder.encode(record.payloadText)
    const actualSha256 = await sha256Hex(payloadBytes)

    if (actualSha256 !== record.dataSha256.toLowerCase() || payloadBytes.byteLength !== record.dataSize) {
      throw new Error('Cached enrichment validation failed.')
    }

    return await buildEnrichmentFromText({
      payloadText: record.payloadText,
      source: 'cache',
      dataUrl: record.dataUrl,
      dataSha256: actualSha256,
    })
  } catch {
    await clearCachedEnrichmentRecord().catch(() => {})
    return null
  }
}

async function loadEmbeddedEnrichment() {
  const response = await fetch(EMBEDDED_ENRICHMENT_URL)

  if (!response.ok) {
    throw new Error(`无法加载内置曲库增强信息：${response.status}`)
  }

  return await buildEnrichmentFromText({
    payloadText: await response.text(),
    source: 'embedded',
    dataUrl: EMBEDDED_ENRICHMENT_URL,
  })
}

async function loadEnrichmentState() {
  if (activeEnrichment) {
    return activeEnrichment
  }

  if (!enrichmentPromise) {
    enrichmentPromise = (async () => {
      const cachedEnrichment = await loadCachedEnrichment()
      const nextEnrichment = cachedEnrichment ?? await loadEmbeddedEnrichment()
      activeEnrichment = nextEnrichment
      return nextEnrichment
    })()
  }

  return await enrichmentPromise
}

function mergeSongEnrichment(song: RawSong, enrichment: SongEnrichmentPayload) {
  const record = enrichment.records[String(song.music_id)]
  return record ? { ...song, ...record } : song
}

function normalizeCatalogSongs(payload: SongCatalogResponse, enrichment: SongEnrichmentPayload) {
  return payload.mdb_data.map((song, index) => normalizeSong(mergeSongEnrichment(song, enrichment), index))
}

async function loadMdbPayload(manifest: MdbVersionManifest, version: number) {
  const mdbUrl = manifest.files[String(version)]

  if (!mdbUrl) {
    throw new Error(`本地 MDB 版本 ${version} 缺少文件路径。`)
  }

  const response = await fetch(mdbUrl)

  if (!response.ok) {
    throw new Error(`无法加载本地 MDB ${version}：${response.status}`)
  }

  return {
    mdbUrl,
    payload: parseMdbBinary(new Uint8Array(await response.arrayBuffer())),
  }
}

async function buildCatalogForVersion(manifest: MdbVersionManifest, version: number) {
  const [enrichment, mdb] = await Promise.all([
    loadEnrichmentState(),
    loadMdbPayload(manifest, version),
  ])

  return {
    source: 'local-mdb',
    mdbVersion: version,
    mdbUrl: mdb.mdbUrl,
    isDefaultVersion: version === manifest.latest,
    enrichmentSource: enrichment.source,
    catalogVersion: enrichment.catalogVersion,
    publishedAt: enrichment.publishedAt,
    dataUrl: enrichment.dataUrl,
    dataSize: enrichment.dataSize,
    dataSha256: enrichment.dataSha256,
    songs: normalizeCatalogSongs(mdb.payload, enrichment.payload),
  } satisfies ActiveSongCatalog
}

async function loadSongCatalogState(options?: { mdbVersion?: number | null }) {
  const manifest = await loadMdbManifest()
  const version = resolveMdbVersion(manifest, options?.mdbVersion)
  const activeCatalog = activeCatalogs.get(version)

  if (activeCatalog) {
    return activeCatalog
  }

  const activePromise = catalogPromiseCache.get(version)

  if (activePromise) {
    return await activePromise
  }

  const loader = buildCatalogForVersion(manifest, version).then((catalog) => {
    activeCatalogs.set(version, catalog)
    loadedCatalogVersions.add(version)
    return catalog
  })
  catalogPromiseCache.set(version, loader)
  return await loader
}

function shouldNotifyListener(catalog: ActiveSongCatalog, target: SongCatalogListenerTarget) {
  if (target === 'all') {
    return true
  }

  if (target === 'default') {
    return catalog.isDefaultVersion
  }

  return catalog.mdbVersion === target
}

function notifySongCatalogUpdated(catalog: ActiveSongCatalog) {
  songCatalogListeners.forEach((target, listener) => {
    if (shouldNotifyListener(catalog, target)) {
      listener(catalog.songs, catalog)
    }
  })
}

async function rebuildLoadedCatalogsAndNotify(versions: number[]) {
  for (const version of versions) {
    const catalog = await loadSongCatalogState({ mdbVersion: version })
    notifySongCatalogUpdated(catalog)
  }
}

async function applyActiveEnrichment(enrichment: ActiveEnrichment, options?: { notify?: boolean }) {
  const loadedVersions = [...loadedCatalogVersions]
  activeEnrichment = enrichment
  enrichmentPromise = Promise.resolve(enrichment)
  activeCatalogs.clear()
  catalogPromiseCache.clear()

  if (options?.notify !== false) {
    await rebuildLoadedCatalogsAndNotify(loadedVersions)
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

function shouldApplyEnrichmentUpdate(remote: ActiveEnrichment, current: ActiveEnrichment) {
  if (remote.dataSha256 === current.dataSha256) {
    return false
  }

  if (current.source === 'cache' && current.catalogVersion) {
    return compareCatalogVersions(remote.catalogVersion, current.catalogVersion) > 0
  }

  return true
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

async function fetchEnrichmentBytes(
  url: string,
  onProgress?: (bytes: number, totalBytes: number | null) => void,
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), SONG_LIST_DOWNLOAD_TIMEOUT_MS)

  try {
    const requestUrl = new URL(url)
    requestUrl.searchParams.set('t', String(Date.now()))

    const response = await fetch(requestUrl.toString(), {
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`曲库增强信息请求失败：${response.status}`)
    }

    const contentLength = parseNumber(response.headers.get('Content-Length'))

    if (!response.body) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      onProgress?.(bytes.byteLength, contentLength)
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
        onProgress?.(receivedBytes, contentLength)
      }
    }

    return concatChunks(chunks, receivedBytes)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('曲库增强信息下载超时。')
    }

    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function fetchRemoteEnrichment(onProgress?: (bytes: number, totalBytes: number | null) => void) {
  const bytes = await fetchEnrichmentBytes(REMOTE_ENRICHMENT_URL, onProgress)
  const payloadText = textDecoder.decode(bytes)

  return await buildEnrichmentFromText({
    payloadText,
    source: 'remote',
    dataUrl: REMOTE_ENRICHMENT_URL,
  })
}

function toUpdateManifest(enrichment: ActiveEnrichment): SongListVersionManifest {
  return {
    schemaVersion: 1,
    catalogVersion: enrichment.catalogVersion,
    publishedAt: enrichment.publishedAt ?? '',
    dataUrl: enrichment.dataUrl ?? REMOTE_ENRICHMENT_URL,
    dataSize: enrichment.dataSize,
    dataSha256: enrichment.dataSha256,
    notes: enrichment.payload.notes,
  }
}

async function writeAndApplyEnrichmentUpdate(enrichment: ActiveEnrichment) {
  await writeCachedEnrichmentRecord({
    id: SONG_LIST_CACHE_KEY,
    schemaVersion: 1,
    catalogVersion: enrichment.catalogVersion,
    publishedAt: enrichment.publishedAt,
    dataUrl: enrichment.dataUrl ?? REMOTE_ENRICHMENT_URL,
    dataSize: enrichment.dataSize,
    dataSha256: enrichment.dataSha256,
    payloadText: enrichment.payloadText,
    savedAt: Date.now(),
  })

  await applyActiveEnrichment({ ...enrichment, source: 'cache' })
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

  songListUpdateState.value = 'checking'

  let currentEnrichment: ActiveEnrichment
  let currentCatalog: ActiveSongCatalog

  try {
    currentEnrichment = await loadEnrichmentState()
    currentCatalog = await loadSongCatalogState()
  } catch {
    songListUpdateState.value = 'idle'
    return null
  }

  let remoteEnrichment: ActiveEnrichment

  try {
    remoteEnrichment = await fetchRemoteEnrichment()
  } catch {
    songListUpdateState.value = 'idle'
    return null
  }

  if (!shouldApplyEnrichmentUpdate(remoteEnrichment, currentEnrichment)) {
    songListUpdateState.value = 'idle'
    return null
  }

  const update = {
    manifest: toUpdateManifest(remoteEnrichment),
    current: currentCatalog,
  } satisfies SongListAvailableUpdate
  availableSongListUpdate.value = update
  songListUpdateDialogVisible.value = true
  songListUpdateState.value = 'downloading'
  resetSongListUpdateActionState()
  songListUpdateBytes.value = remoteEnrichment.dataSize
  songListUpdateTotalBytes.value = remoteEnrichment.dataSize

  try {
    await writeAndApplyEnrichmentUpdate(remoteEnrichment)
    songListUpdateState.value = 'updated'
    songListUpdateError.value = ''
    scheduleSongListUpdateDialogClose()
  } catch (error) {
    songListUpdateState.value = 'error'
    songListUpdateError.value = error instanceof Error && error.message
      ? error.message
      : '曲库增强信息更新失败，请稍后重试。'
  }

  return update
}

export function onSongCatalogUpdated(
  listener: SongCatalogListener,
  options?: { mdbVersion?: SongCatalogListenerTarget },
) {
  songCatalogListeners.set(listener, options?.mdbVersion ?? 'default')

  return () => {
    songCatalogListeners.delete(listener)
  }
}

export function loadSongCatalog(options?: { mdbVersion?: number | null }): Promise<SongViewModel[]> {
  return loadSongCatalogState(options).then((catalog) => catalog.songs)
}

export function loadSongCatalogForVersion(mdbVersion: number): Promise<SongViewModel[]> {
  return loadSongCatalog({ mdbVersion })
}

export async function loadSongByMusicId(
  musicId: number,
  options?: { mdbVersion?: number | null },
): Promise<SongViewModel | undefined> {
  const songs = await loadSongCatalog(options)
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
