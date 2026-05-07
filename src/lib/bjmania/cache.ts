import type { BjmaniaGitadoraSnapshot } from '../../types/bjmania'

const BJMANIA_SKILL_CACHE_KEY = 'gddata:bjmania-skill-snapshot'
const BJMANIA_SKILL_CACHE_VERSION = 2

type BjmaniaSkillSnapshotEntry = {
  savedAt: number
  snapshot: BjmaniaGitadoraSnapshot
}

type BjmaniaSkillSnapshotCache = {
  version: number
  savedAt: number
  lastKey: string | null
  snapshots: Record<string, BjmaniaSkillSnapshotEntry>
}

type BjmaniaSkillSnapshotCacheResult = {
  version: number
  savedAt: number
  snapshot: BjmaniaGitadoraSnapshot
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isSnapshot(value: unknown): value is BjmaniaGitadoraSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<BjmaniaGitadoraSnapshot>
  return (
    !!candidate.authUser &&
    typeof candidate.authUser === 'object' &&
    typeof candidate.currentVersion === 'number'
  )
}

function snapshotKey(snapshot: BjmaniaGitadoraSnapshot) {
  return `${snapshot.authUser.id || 'unknown'}:${snapshot.currentVersion}`
}

function normalizeSnapshot(snapshot: BjmaniaGitadoraSnapshot): BjmaniaGitadoraSnapshot {
  return {
    ...snapshot,
    availableVersions: Array.isArray(snapshot.availableVersions) && snapshot.availableVersions.length > 0
      ? snapshot.availableVersions
      : [snapshot.currentVersion],
  }
}

function normalizeCachePayload(payload: unknown): BjmaniaSkillSnapshotCache | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as Partial<BjmaniaSkillSnapshotCache> & {
    snapshot?: unknown
  }

  if (
    candidate.version === BJMANIA_SKILL_CACHE_VERSION &&
    typeof candidate.savedAt === 'number' &&
    (typeof candidate.lastKey === 'string' || candidate.lastKey === null) &&
    candidate.snapshots &&
    typeof candidate.snapshots === 'object'
  ) {
    const snapshots: Record<string, BjmaniaSkillSnapshotEntry> = {}

    Object.entries(candidate.snapshots).forEach(([key, entry]) => {
      if (!entry || typeof entry !== 'object') {
        return
      }

      const snapshotEntry = entry as Partial<BjmaniaSkillSnapshotEntry>
      if (typeof snapshotEntry.savedAt === 'number' && isSnapshot(snapshotEntry.snapshot)) {
        snapshots[key] = {
          savedAt: snapshotEntry.savedAt,
          snapshot: normalizeSnapshot(snapshotEntry.snapshot),
        }
      }
    })

    return {
      version: BJMANIA_SKILL_CACHE_VERSION,
      savedAt: candidate.savedAt,
      lastKey: candidate.lastKey,
      snapshots,
    }
  }

  if (candidate.version === 1 && typeof candidate.savedAt === 'number' && isSnapshot(candidate.snapshot)) {
    const key = snapshotKey(candidate.snapshot)
    return {
      version: BJMANIA_SKILL_CACHE_VERSION,
      savedAt: candidate.savedAt,
      lastKey: key,
      snapshots: {
        [key]: {
          savedAt: candidate.savedAt,
          snapshot: normalizeSnapshot(candidate.snapshot),
        },
      },
    }
  }

  return null
}

function readCache() {
  if (!canUseStorage()) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(BJMANIA_SKILL_CACHE_KEY)
    return raw ? normalizeCachePayload(JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeCache(cache: BjmaniaSkillSnapshotCache) {
  if (!canUseStorage()) {
    return
  }

  try {
    window.localStorage.setItem(BJMANIA_SKILL_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore storage quota and serialization failures. Live data still remains usable in memory.
  }
}

function entryToResult(entry: BjmaniaSkillSnapshotEntry): BjmaniaSkillSnapshotCacheResult {
  return {
    version: BJMANIA_SKILL_CACHE_VERSION,
    savedAt: entry.savedAt,
    snapshot: normalizeSnapshot(entry.snapshot),
  }
}

function findNewestEntry(entries: BjmaniaSkillSnapshotEntry[]) {
  return entries
    .slice()
    .sort((left, right) => right.savedAt - left.savedAt)[0] ?? null
}

export function loadBjmaniaSkillSnapshotCache(options?: { userId?: string | null; version?: number | null }) {
  const cache = readCache()

  if (!cache) {
    return null
  }

  const requestedUserId = options?.userId?.trim()
  const requestedVersion = options?.version

  if (requestedUserId && typeof requestedVersion === 'number') {
    const exactEntry = cache.snapshots[`${requestedUserId}:${requestedVersion}`]
    return exactEntry ? entryToResult(exactEntry) : null
  }

  const entries = Object.values(cache.snapshots).filter((entry) => {
    if (requestedUserId && entry.snapshot.authUser.id !== requestedUserId) {
      return false
    }

    if (typeof requestedVersion === 'number' && entry.snapshot.currentVersion !== requestedVersion) {
      return false
    }

    return true
  })

  if (entries.length > 0) {
    const newestEntry = findNewestEntry(entries)
    return newestEntry ? entryToResult(newestEntry) : null
  }

  if (!requestedUserId && requestedVersion === undefined && cache.lastKey) {
    const lastEntry = cache.snapshots[cache.lastKey]
    return lastEntry ? entryToResult(lastEntry) : null
  }

  return null
}

export function saveBjmaniaSkillSnapshotCache(snapshot: BjmaniaGitadoraSnapshot) {
  if (!canUseStorage()) {
    return
  }

  const cache = readCache() ?? {
    version: BJMANIA_SKILL_CACHE_VERSION,
    savedAt: Date.now(),
    lastKey: null,
    snapshots: {},
  }
  const key = snapshotKey(snapshot)
  const savedAt = Date.now()

  cache.version = BJMANIA_SKILL_CACHE_VERSION
  cache.savedAt = savedAt
  cache.lastKey = key
  cache.snapshots[key] = {
    savedAt,
    snapshot,
  }

  writeCache(cache)
}

export function clearBjmaniaSkillSnapshotCache() {
  if (!canUseStorage()) {
    return
  }

  try {
    window.localStorage.removeItem(BJMANIA_SKILL_CACHE_KEY)
  } catch {
    // Ignore storage access failures.
  }
}
