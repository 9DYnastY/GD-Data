import type { BjmaniaGitadoraSnapshot } from '../../types/bjmania'

const BJMANIA_SKILL_CACHE_KEY = 'gddata:bjmania-skill-snapshot'
const BJMANIA_SKILL_CACHE_VERSION = 1

type BjmaniaSkillSnapshotCache = {
  version: number
  savedAt: number
  snapshot: BjmaniaGitadoraSnapshot
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isValidCachePayload(payload: unknown): payload is BjmaniaSkillSnapshotCache {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const candidate = payload as Partial<BjmaniaSkillSnapshotCache>

  return (
    candidate.version === BJMANIA_SKILL_CACHE_VERSION &&
    typeof candidate.savedAt === 'number' &&
    !!candidate.snapshot &&
    typeof candidate.snapshot === 'object'
  )
}

export function loadBjmaniaSkillSnapshotCache() {
  if (!canUseStorage()) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(BJMANIA_SKILL_CACHE_KEY)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    return isValidCachePayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveBjmaniaSkillSnapshotCache(snapshot: BjmaniaGitadoraSnapshot) {
  if (!canUseStorage()) {
    return
  }

  const payload: BjmaniaSkillSnapshotCache = {
    version: BJMANIA_SKILL_CACHE_VERSION,
    savedAt: Date.now(),
    snapshot,
  }

  try {
    window.localStorage.setItem(BJMANIA_SKILL_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage quota and serialization failures. Live data still remains usable in memory.
  }
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
