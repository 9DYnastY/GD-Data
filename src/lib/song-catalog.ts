import { parseMdbBinary } from './mdb-parser'
import { getMdbSong, loadMdbIndex } from './mdb-index'
import { normalizeSong } from './song-normalizer'
import type { MdbIndex } from '../types/mdb'
import type { SongCatalogResponse, SongViewModel } from '../types/song'

const MDB_MANIFEST_URL = '/mdb/m32_manifest.json'

type SongCatalogListenerTarget = number | 'all' | 'default'

interface MdbVersionManifest {
  schemaVersion: 1
  game: 'M32'
  latest: number
  versions: number[]
  files: Record<string, string>
}

export interface ActiveSongCatalog {
  source: 'local-mdb'
  mdbVersion: number
  mdbUrl: string
  isDefaultVersion: boolean
  resourceRevision: string | null
  songs: SongViewModel[]
}

type SongCatalogListener = (songs: SongViewModel[], catalog: ActiveSongCatalog) => void

const songCatalogListeners = new Map<SongCatalogListener, SongCatalogListenerTarget>()
const catalogPromiseCache = new Map<number, Promise<ActiveSongCatalog>>()
const activeCatalogs = new Map<number, ActiveSongCatalog>()

let mdbManifestPromise: Promise<MdbVersionManifest> | null = null

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

function parseMdbManifest(value: unknown): MdbVersionManifest {
  if (!isRecord(value)) {
    throw new Error('本地 MDB 版本信息格式不正确。')
  }

  const schemaVersion = parseNumber(value.schemaVersion)
  const game = typeof value.game === 'string' ? value.game.trim() : ''
  const latest = parseNumber(value.latest)
  const versions = Array.isArray(value.versions)
    ? value.versions.map(parseNumber).filter((version): version is number => version !== null)
    : []
  const files = isRecord(value.files)
    ? Object.fromEntries(
        Object.entries(value.files).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      )
    : {}

  if (schemaVersion !== 1 || game !== 'M32' || latest === null || versions.length === 0) {
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
    latest,
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

export async function resolveAvailableLocalMdbVersions(gameVersions: number[]) {
  const manifest = await loadMdbManifest()
  const ownedVersions = new Set(gameVersions.filter((version) => Number.isFinite(version)))
  return manifest.versions.filter((version) => ownedVersions.has(version))
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

function normalizeCatalogSongs(payload: SongCatalogResponse, index: MdbIndex | null) {
  return payload.mdb_data.map((song, songIndex) => (
    normalizeSong(song, songIndex, index, index ? getMdbSong(index, song.music_id) : null)
  ))
}

async function buildCatalogForVersion(manifest: MdbVersionManifest, version: number) {
  const [mdb, resourceIndex] = await Promise.all([
    loadMdbPayload(manifest, version),
    loadMdbIndex().catch(() => null),
  ])

  return {
    source: 'local-mdb',
    mdbVersion: version,
    mdbUrl: mdb.mdbUrl,
    isDefaultVersion: version === manifest.latest,
    resourceRevision: resourceIndex?.revision ?? null,
    songs: normalizeCatalogSongs(mdb.payload, resourceIndex),
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

  const loader = buildCatalogForVersion(manifest, version)
    .then((catalog) => {
      activeCatalogs.set(version, catalog)
      return catalog
    })
    .catch((error) => {
      catalogPromiseCache.delete(version)
      throw error
    })
  catalogPromiseCache.set(version, loader)
  return await loader
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

export async function loadSongByMusicId(
  musicId: number,
  options?: { mdbVersion?: number | null },
): Promise<SongViewModel | undefined> {
  const songs = await loadSongCatalog(options)
  return songs.find((song) => song.musicId === musicId)
}
